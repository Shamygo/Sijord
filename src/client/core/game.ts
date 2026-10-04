import * as THREE from 'three';
import type { PlayerProfile } from '../../shared/types';
import { NetClient, serverOverride, type NetEvents } from '../net/client';
import { P2PClient } from '../net/p2p';
import { Professor } from '../npc/professor';
import { createAvatar } from '../player/avatar';
import { PlayerController } from '../player/controller';
import { ThirdPersonCamera } from '../player/camera';
import { RemotePlayer } from '../player/remote';
import { Hud, type Quest } from '../ui/hud';
import { applyAtmosphere, createWorld } from '../world';
import type { World } from '../world/types';
import { Input } from './input';
import { writeSave, type SaveData } from './save';

const TALK_RADIUS = 2.6;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private world: World;
  private input: Input;
  private controller = new PlayerController();
  private cam: ThirdPersonCamera;
  private avatar;
  private professor: Professor;
  private hud: Hud;
  private net: { send(s: ReturnType<PlayerController['snapshot']>, nowMs: number): void };
  private partners = new Map<string, { remote: RemotePlayer; profile: PlayerProfile }>();
  private slot: 0 | 1 = 0;
  private flags: Set<string>;
  private talking = false;
  private timer = new THREE.Timer();
  private elapsed = 0;
  private gameMinutes = 9 * 60;

  constructor(private parent: HTMLElement, private save: SaveData) {
    this.flags = new Set(save.flags);
    const canvas = document.createElement('canvas');
    canvas.className = 'game';
    parent.append(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.world = createWorld();
    applyAtmosphere(this.scene);
    this.scene.add(this.world.root);

    this.input = new Input(canvas);
    this.cam = new ThirdPersonCamera();
    this.avatar = createAvatar(save.profile.appearance);
    this.scene.add(this.avatar.root);

    const a = this.world.anchors;
    this.professor = new Professor(a.professor, a.professorYaw);
    this.professor.setMarker(!this.flags.has('met-professor'));
    this.scene.add(this.professor.root);
    // Added before the first movement update, which is when the collider list gets indexed.
    this.world.colliders.push({ kind: 'circle', x: a.professor.x, z: a.professor.z, r: 0.45 });

    this.hud = new Hud(this.world, save.profile, () => this.input.requestLock());
    parent.append(this.hud.el);
    canvas.addEventListener('click', () => {
      if (!this.talking) this.input.requestLock();
    });

    this.spawn(0);
    this.refreshQuests();

    const events: NetEvents = {
      onStatus: (s) => {
        const text = {
          connecting: 'Connecting to co-op server...',
          online: `World "${save.room}" · waiting for your partner`,
          offline: 'Solo mode (could not reach co-op)',
          full: `World "${save.room}" already has two players · playing solo`,
        }[s];
        this.hud.setNetStatus(text);
      },
      onWelcome: (slot, peers) => {
        // Second to arrive takes house 2, unless they've already walked off.
        const home = this.world.anchors.playerSpawns[slot === 0 ? 1 : 0];
        if (slot !== this.slot && this.controller.position.distanceTo(home) < 3) this.spawn(slot);
        this.slot = slot;
        for (const p of peers) {
          this.addPartner(p.id, p.profile);
          if (p.s) this.partners.get(p.id)!.remote.push(p.s, performance.now());
        }
      },
      onPeerJoined: (id, _slot, profile) => {
        this.addPartner(id, profile);
        this.hud.showToast(`${profile.name} joined`, 'Your partner is in Sijord');
      },
      onPeerState: (id, s) => this.partners.get(id)?.remote.push(s, performance.now()),
      onPeerLeft: (id) => {
        const p = this.partners.get(id);
        if (!p) return;
        this.scene.remove(p.remote.root);
        p.remote.dispose();
        this.partners.delete(id);
        this.hud.showToast(`${p.profile.name} left`);
        this.updatePartnerStatus();
      },
    };
    // Default co-op is peer-to-peer (nothing to host). `?server=ws://...` uses the Node server instead.
    const server = serverOverride();
    if (server) {
      const ws = new NetClient(events);
      ws.connect(server, save.room, save.profile);
      this.net = { send: (s, now) => ws.sendState(s, now) };
    } else {
      const p2p = new P2PClient(events);
      p2p.connect(save.room, save.profile, new URLSearchParams(location.search).get('relay'));
      this.net = p2p;
    }

    addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Dev-only hooks for automated play-testing. */
  debugTeleport(x: number, z: number, yaw = 0): void {
    this.controller.teleport(new THREE.Vector3(x, this.world.heightAt(x, z), z), yaw);
    this.cam.snapBehind(this.controller.position, yaw);
  }

  start(): void {
    this.hud.showToast('Bramblewick', 'Your hometown', 4);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private spawn(slot: 0 | 1): void {
    const a = this.world.anchors;
    this.controller.teleport(a.playerSpawns[slot], a.playerSpawnYaw[slot]);
    // Open on the player standing in front of their house, like stepping out of the front door.
    this.cam.snapBehind(this.controller.position, a.playerSpawnYaw[slot] + Math.PI);
  }

  private addPartner(id: string, profile: PlayerProfile): void {
    if (this.partners.has(id)) return;
    const remote = new RemotePlayer(profile);
    this.scene.add(remote.root);
    this.partners.set(id, { remote, profile });
    this.updatePartnerStatus();
  }

  private updatePartnerStatus(): void {
    const names = [...this.partners.values()].map((p) => p.profile.name);
    this.hud.setNetStatus(names.length ? `Playing with ${names.join(', ')} · world "${this.save.room}"` : `World "${this.save.room}" · waiting for your partner`);
  }

  private refreshQuests(): void {
    const a = this.world.anchors;
    const gate = a.landmarks.find((l) => l.id === 'gate')?.position ?? a.professor;
    const met = this.flags.has('met-professor');
    const left = this.flags.has('left-town');
    const quests: Quest[] = [
      { id: 'meet', text: 'Meet Professor Hazel', main: true, done: met, target: { x: a.professor.x, z: a.professor.z } },
    ];
    if (met) quests.push({ id: 'route1', text: 'Head out onto Route 1', main: true, done: left, target: { x: gate.x, z: gate.z } });
    if (left) quests.push({ id: 'explore', text: 'Explore Sijord, then return to the lab' });
    this.hud.setQuests(quests.slice(-3));
  }

  private setFlag(flag: string): void {
    if (this.flags.has(flag)) return;
    this.flags.add(flag);
    this.save.flags = [...this.flags];
    writeSave(this.save);
    this.refreshQuests();
  }

  private async talkToProfessor(): Promise<void> {
    this.talking = true;
    this.input.releaseLock();
    this.hud.setPrompt(null);
    this.professor.lookAt(this.controller.position);
    const partner = [...this.partners.values()][0]?.profile.name ?? null;
    const first = !this.flags.has('met-professor');
    await this.hud.dialogue.play(first ? this.professor.introLines(this.save.profile.name, partner) : this.professor.repeatLines());
    this.professor.lookAt(null);
    this.talking = false;
    if (first) {
      this.professor.setMarker(false);
      this.setFlag('met-professor');
      this.hud.showToast('New quest', 'Head out onto Route 1');
    }
  }

  private frame(): void {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.elapsed += dt;
    this.gameMinutes += dt; // one real second is one in-game minute
    const now = performance.now();
    const input = this.input;

    if (input.locked) {
      this.cam.onMouseDelta(input.mouseDX, input.mouseDY);
      this.cam.onWheel(input.wheel);
    }

    this.hud.setPointerLocked(input.locked || this.talking);
    const move = input.move();
    if (this.talking) {
      if (input.consume('KeyE') || input.consume('Space') || input.consume('Enter')) this.hud.dialogue.next();
      move.forward = move.right = 0;
      move.jump = move.sprint = false;
    }
    this.controller.update(dt, move, this.cam.yaw, this.world);
    const snap = this.controller.snapshot();
    this.avatar.root.position.copy(this.controller.position);
    this.avatar.root.rotation.y = this.controller.yaw;
    this.avatar.animate(dt, snap);
    this.cam.update(dt, this.controller.position, this.world, move.sprint && snap.speed > 5);

    // Interaction
    if (!this.talking) {
      const near = this.controller.position.distanceTo(this.professor.position) < TALK_RADIUS;
      this.hud.setPrompt(near ? `Talk to ${this.professor.name}` : null);
      if (near && input.consume('KeyE')) void this.talkToProfessor();
    }

    // Leaving town through the gate starts the open world.
    const town = this.world.regions[0];
    if (town && this.flags.has('met-professor') && !this.flags.has('left-town')) {
      const d = Math.hypot(this.controller.position.x - town.centerX, this.controller.position.z - town.centerZ);
      if (d > town.radius + 4) {
        this.setFlag('left-town');
        this.hud.showToast('Route 1', 'The open world awaits', 5);
      }
    }

    this.professor.update(dt);
    for (const p of this.partners.values()) p.remote.update(dt, now);
    this.net.send(snap, now);

    // Also keeps the sun's shadow camera centred on the player.
    this.world.update(dt, this.elapsed, this.controller.position);

    const partner = [...this.partners.values()][0]?.remote.root.position;
    this.hud.update(
      dt,
      { x: snap.x, z: snap.z, yaw: this.controller.yaw },
      this.cam.yaw,
      this.controller.stamina,
      this.controller.exhausted ?? false,
      this.world.anchors.landmarks.map((l) => ({ x: l.position.x, z: l.position.z, label: l.label })),
      partner ? { x: partner.x, z: partner.z } : undefined,
      this.gameMinutes,
    );

    this.renderer.render(this.scene, this.cam.camera);
    input.endFrame();
  }

  private resize(): void {
    const w = this.parent.clientWidth || innerWidth;
    const ht = this.parent.clientHeight || innerHeight;
    this.renderer.setSize(w, ht, false);
    this.cam.camera.aspect = w / ht;
    this.cam.camera.updateProjectionMatrix();
  }
}
