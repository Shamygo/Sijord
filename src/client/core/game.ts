import * as THREE from 'three';
import { catchChance, rollCatch, type CatchRoll } from '../../shared/battle/catch';
import { createCreature, displayName, evolve, healCreature, isUsable, maxHp, teachMove } from '../../shared/battle/creature';
import { randomSeed, Rng } from '../../shared/battle/rng';
import { levelCap } from '../../shared/battle/stats';
import type { Creature } from '../../shared/battle/types';
import { moveData } from '../../shared/data/moves';
import { SPECIES, species, STARTERS } from '../../shared/data/species';
import { BattleDirector, arenaSpots, type BattleOutcome, type BattleStart } from '../battle/director';
import { classInfo } from '../../shared/classes';
import { ITEMS, PARTY_MAX, STARTING_BAG } from '../../shared/items';
import type { BattleControl, BattleFrame } from '../../shared/battle/session';
import { RemoteBattle } from '../battle/remote';
import type { BallCatchFx, BallThrowFx, PlayerProfile, PlayerSnapshot } from '../../shared/types';
import { failedCatchReaction, isUnaware, type CatchReaction } from '../../shared/overworld-catch';
import { chargeDamage, knockdownTilt, KNOCKDOWN_ANGLE, TRAINER_HP, TrainerVitals, trainerMaxHp } from '../../shared/trainer-vitals';
import { NetClient, serverOverride, type NetEvents } from '../net/client';
import { P2PClient } from '../net/p2p';
import { Professor } from '../npc/professor';
import { Rival } from '../npc/rival';
import { Follower } from '../overworld/follower';
import { seedFromName, WildManager, type WildCreature } from '../overworld/wild';
import { isTreat, OverworldThrows, TREAT_ITEM } from '../overworld/throw';
import { launchElevation, launchVelocity, solveLaunch, type Vec3 } from '../overworld/ball-flight';
import { THROW_CLIP } from '../player/imported-trainer';
import { createAvatar } from '../player/avatar';
import { PLAYER_TUNING, PlayerController } from '../player/controller';
import { CAMERA_TUNING, ThirdPersonCamera } from '../player/camera';
import { RemotePlayer } from '../player/remote';
import { Hud, type Quest } from '../ui/hud';
import { GameMenu, type MenuTab } from '../ui/menu';
import { Portraits } from '../ui/portraits';
import { applyAtmosphere, createWorld } from '../world';
import { DiscoveryProps, type DiscoverySpot } from '../world/discoveries';
import { DISCOVERY_LABEL, discoveryCounts, tabletReward } from '../../shared/discoveries';
import { TOWN } from '../world/layout';
import type { World } from '../world/types';
import { Input } from './input';
import { RenderPipeline } from './render';
import { writeSave, type SaveData } from './save';
import { keyLabel, loadSettings, saveSettings, type Action, type Settings } from './settings';

const TALK_RADIUS = 2.6;
/** A charging wild Pokemon this close can be cut off by the partner (DESIGN §5.3). */
const INTERCEPT_RANGE = 14;
/** Standing this close to a house door offers a rest. */
const HOME_RADIUS = 3;

/** A battle in progress, or one whose ring is still fading out. */
interface ActiveBattle {
  director: BattleDirector;
  wild: WildCreature[];
  /** Seconds left of the fade-out once the battle is over. */
  closing: number | null;
}

interface PartnerFollower {
  follower: Follower;
  lead: string | null;
  last: THREE.Vector3;
  speed: number;
}

/** Optional camera settings hooks; present once the camera supports them. */
interface CameraSettingsHooks {
  setSensitivity?(mult: number): void;
  setInvertY?(v: boolean): void;
  setFov?(deg: number): void;
}

export class Game {
  private renderer: THREE.WebGLRenderer;
  private pipeline: RenderPipeline;
  private settings: Settings = loadSettings();
  private menu: GameMenu;
  private quests: Quest[] = [];
  private scene = new THREE.Scene();
  private world: World;
  private input: Input;
  private controller: PlayerController;
  private cam: ThirdPersonCamera;
  private avatar;
  private professor: Professor;
  private rival: Rival;
  private hud: Hud;
  /** The player's Pokemon, in order; lives in the save. */
  private party: Creature[];
  private portraits = new Portraits(128);
  /** The lead Pokemon walking beside the player. */
  private follower = new Follower();
  private followerOut = true;
  private wild: WildManager;
  private battle: ActiveBattle | null = null;
  private remoteBattle: RemoteBattle | null = null;
  private remoteBattleHost: string | null = null;
  private partnerBattles = new Map<string, BattleFrame>();
  private battleControl: BattleControl | undefined;
  private remoteFrame: BattleFrame | undefined;
  private destination: {x:number;z:number;label:string} | null = null;
  private appliedBattleResults = new Set<string>();
  private guestSaveSignature = '';
  private guestProgression: BattleOutcome | null = null;

  /** A scripted scene (starter pick, rival challenge) is running: no free movement. */
  private scripted = false;
  private partnerFollowers = new Map<string, PartnerFollower>();
  private net: { send(s: PlayerSnapshot, nowMs: number): void };
  private partners = new Map<string, { remote: RemotePlayer; profile: PlayerProfile }>();
  private slot: 0 | 1 = 0;
  private flags: Set<string>;
  private talking = false;
  private timer = new THREE.Timer();
  private elapsed = 0;
  private gameMinutes = 9 * 60;
  /** Set when we release the mouse on purpose (menus, dialogue) so it doesn't count as a pause. */
  private suppressPause = false;
  private started = false;

  /** The trainer's own HP and knockdowns (DESIGN §5.4). */
  private vitals: TrainerVitals;
  private knockedOut = false;
  /** Overworld throws: aim preview, flights, catches and missed balls lying around. */
  private throws: OverworldThrows;
  /** Supply caches, Lysfolk tablets and field notes out in Hearthmeadow. */
  private discoveries: DiscoveryProps;
  private aiming = false;
  private aimTime = 0;
  private aimBall = 'poke-ball';
  private aimCamHold = 0;
  private aimWanted = false;
  private throwCooldown = 0;
  /** Throw ids only ever grow, even across reloads, so the partner never mistakes a new throw for an old one. */
  private throwSeq = Date.now();
  private catchRng = new Rng(randomSeed());
  /** A creature that broke out and will start a battle once it has popped back out. */
  private pendingBattle: { m: WildCreature; t: number } | null = null;
  /** The partner rushing a charging wild Pokemon; the battle starts when it gets there. */
  private intercept: { m: WildCreature; t: number } | null = null;
  /** Per friend: shared wild creatures they're battling or catching (hidden here meanwhile), and their herds' cells. */
  private partnerWild = new Map<string, { busy: string[]; cells: string[] }>();
  /** The latest throw and catch, repeated in snapshots for a moment so the partner sees them. */
  private netThrow: { fx: BallThrowFx; until: number } | null = null;
  private netCatch: { fx: BallCatchFx; until: number } | null = null;
  private lastCatch: { species: string; chance: number; unaware: boolean; caught?: boolean; reaction?: CatchReaction } | null = null;
  /** Dev only: force overworld catch outcomes in scripted tests. */
  debugCatch: { caught?: boolean; reaction?: CatchReaction } | null = null;

  constructor(private parent: HTMLElement, private save: SaveData) {
    this.flags = new Set(save.flags);
    const canvas = document.createElement('canvas');
    canvas.className = 'game';
    parent.append(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    save.bag ??= { ...STARTING_BAG };
    const mods = classInfo(save.profile.playerClass).modifiers;
    this.controller = new PlayerController({ staminaDrain: PLAYER_TUNING.staminaDrain / mods.stamina });
    const hpMax = trainerMaxHp(1, mods.maxHp);
    this.vitals = new TrainerVitals(hpMax, save.trainerHp && save.trainerHp > 0 ? save.trainerHp : hpMax);

    this.world = createWorld();
    applyAtmosphere(this.scene);
    this.scene.add(this.world.root);
    this.discoveries = new DiscoveryProps(this.world, save.found ?? []);
    this.scene.add(this.discoveries.root);

    this.input = new Input(canvas, () => this.settings, (a) => this.onInstant(a), () =>
      !this.menu?.isOpen && !this.talking && (!this.scripted || !!(this.battle && this.battle.closing === null) || !!this.remoteBattleHost) &&
      !(this.battle?.director.ui.commandsOpen || this.remoteBattle?.ui.commandsOpen));
    this.cam = new ThirdPersonCamera();
    this.pipeline = new RenderPipeline(this.renderer, this.scene, this.cam.camera, this.settings.quality);
    this.avatar = createAvatar(save.profile.appearance);
    this.avatar.setGround((x, z) => this.world.heightAt(x, z));
    // Yaw first, then tip over around the trainer's own left-right axis when knocked down.
    this.avatar.root.rotation.order = 'YXZ';
    this.scene.add(this.avatar.root);

    const a = this.world.anchors;
    this.professor = new Professor(a.professor, a.professorYaw);
    this.scene.add(this.professor.root);
    this.party = save.party ??= [];
    save.box ??= [];
    save.dex ??= { seen: [], caught: [] };
    for (const c of this.party) this.markDex(c.species, true);
    // Sunniva waits beside her aunt once the player has a partner.
    this.rival = new Rival(this.world, a.professor.clone().add(new THREE.Vector3(2.8, 0, 1.4)), a.professorYaw - 0.5);
    this.scene.add(this.rival.root);
    this.updateNpcState();
    this.scene.add(this.follower.root);
    // Herds come from the world's name, so both friends meet the same ones.
    this.wild = new WildManager(this.world, randomSeed(), seedFromName(save.room));
    this.scene.add(this.wild.root);
    this.throws = new OverworldThrows({
      world: this.world,
      targets: () => this.wild.creatures.filter((m) => m.state !== 'battle' && m.state !== 'ball' && m.state !== 'gone' && !m.remoteBusy),
      onHit: (m, ball, id, at) => this.overworldCatchRoll(m, ball, id, at),
      onResult: (m, ball, roll) => this.overworldCatchResult(m, ball, roll),
      // A ball thudding down nearby puts creatures on their guard.
      onRest: (_ball, at) => this.wild.disturb(at.x, at.z, 4.5, 10),
      onSink: (ball) => this.hud.showToast(`The ${ITEMS[ball]?.name ?? 'ball'} sank`, isTreat(ball) ? 'Treats that land in deep water are lost' : 'Balls that land in deep water are lost', 2.2),
      onTreat: (m, at) => this.onTreat(m, at),
    });
    this.scene.add(this.throws.root);
    // Added before the first movement update, which is when the collider list gets indexed.
    this.world.colliders.push({ kind: 'circle', x: a.professor.x, z: a.professor.z, r: 0.45 });

    this.hud = new Hud(this.world, save.profile, () => this.input.requestLock(), (a) => this.onAction(a));
    parent.append(this.hud.el);
    canvas.addEventListener('click', () => {
      if (!this.talking && !this.menu.isOpen) this.input.requestLock();
    });

    this.menu = new GameMenu({
      world: this.world,
      minimap: this.hud.minimap,
      player: () => ({ x: this.controller.position.x, z: this.controller.position.z, yaw: this.controller.yaw }),
      partner: () => {
        const p = [...this.partners.values()][0];
        return p ? { x: p.remote.root.position.x, z: p.remote.root.position.z, name: p.profile.name } : null;
      },
      destination: () => this.destination,
      setDestination: p => {this.destination = p;},
      quests: () => this.quests,
      found: () => this.save.found ?? [],
      bag: () => this.save.bag ?? {},
      party: () => this.party,
      box: () => (this.save.box ??= []),
      nearPc: () => this.nearPc(),
      dex: () => (this.save.dex ??= { seen: [], caught: [] }),
      portrait: (sp: string) => this.portraits.get(sp),
      trainerPortrait: () => this.portraits.trainer(save.profile.appearance),
      useItem: (id,uid) => {
        const c = this.party.find(c => c.uid === uid); const item = ITEMS[id]; const bag = this.save.bag!;
        if (!c || !item?.heal || c.hp <= 0 || c.hp >= maxHp(c) || !bag[id] || this.battle || this.remoteBattleHost) return false;
        c.hp = Math.min(maxHp(c),c.hp+item.heal); bag[id]--; this.onPartyChanged(); this.hud.showToast(`${displayName(c)} recovered HP`); return true;
      },
      onPartyChanged: () => this.onPartyChanged(),
      levelCap: () => this.levelCap,
      settings: this.settings,
      onSettings: (s) => this.applySettings(s),
      onSave: () => writeSave(this.save),
      onResume: () => this.input.clearHeld(),
      onQuitToTitle: () => {
        writeSave(this.save);
        location.reload();
      },
    });
    this.hud.el.append(this.menu.el);
    // Esc while playing releases the mouse; treat that as "pause" and open the menu.
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && !this.talking && !this.menu.isOpen && !this.suppressPause && !this.remoteBattleHost && !this.battle && !this.scripted) this.openMenu('settings');
      this.suppressPause = false;
    });
    this.applySettings(this.settings);

    this.spawn(0);
    this.refreshQuests();
    this.onPartyChanged(false);

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
      onPeerState: (id, s) => {
        this.partners.get(id)?.remote.push(s, performance.now());
        const pf = this.partnerFollowers.get(id);
        // Only species this build knows; anything else from the wire is ignored.
        if (s.battleFrame) this.partnerBattles.set(id, s.battleFrame); else this.partnerBattles.delete(id);
        const hosted = this.battle?.director;
        if (s.battleControl && hosted) {
          const c = s.battleControl;
          if (c.id === hosted.id && c.join && hosted.lobby) {
            const party = c.join.party.filter(m => SPECIES[m.species] && isUsable(m)).slice(0,6);
            const balls = Object.fromEntries(Object.entries(c.join.balls ?? {}).filter(([b, n]) => ITEMS[b]?.category === 'balls' && Number.isFinite(n) && n > 0).map(([b, n]) => [b, Math.min(999, Math.floor(n))]));
            const catchMult = Math.min(1.2, Math.max(0.8, c.join.catchMult ?? 1));
            if (party.length && hosted.acceptPartner(id, {owner:'partner', name:this.partners.get(id)?.profile.name ?? 'Partner', creatures:structuredClone(c.join.party.filter(m => SPECIES[m.species]).slice(0,6)), levelCap:Math.min(100,Math.max(1,c.join.levelCap)), xpMult:1, catchMult}, balls)) this.hud.showToast('Partner joined the battle');
          }
          hosted.partnerControl(id,c);
        }
        if (this.remoteBattleHost === id) this.receiveRemoteBattle(s.battleFrame);
        if (pf) pf.lead = s.lead && !s.battle && SPECIES[s.lead] ? s.lead : null;
        // The partner's throws replay here (catching itself is decided on their side).
        if (s.ballThrow && ITEMS[s.ballThrow.ball] && this.throws.remoteThrow(id, s.ballThrow, THROW_CLIP.release)) this.partners.get(id)?.remote.avatar.gesture('throw');
        if (s.ballCatch && ITEMS[s.ballCatch.ball]) this.throws.remoteCatch(id, s.ballCatch);
        // Shared herds: what the friend caught or beat fades here; what they're fighting hides.
        const keys = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string' && k.length < 48).slice(0, max) : []);
        const taken = keys(s.wildTaken, 64);
        if (taken.length) this.wild.applyTaken(taken);
        this.partnerWild.set(id, { busy: keys(s.wildBusy, 16), cells: keys(s.wildCells, 16) });
      },
      onPeerLeft: (id) => {
        this.partnerBattles.delete(id); this.battle?.director.partnerLeft(id);
        this.partnerWild.delete(id);
        if (this.remoteBattleHost === id) { this.finishRemoteBattle(); this.hud.showToast('Partner disconnected', 'The shared battle ended on this device.'); }
        const p = this.partners.get(id);
        if (!p) return;
        this.scene.remove(p.remote.root);
        p.remote.dispose();
        this.partners.delete(id);
        const pf = this.partnerFollowers.get(id);
        if (pf) {
          this.scene.remove(pf.follower.root);
          pf.follower.dispose();
          this.partnerFollowers.delete(id);
        }
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

  showAssetFallback(): void { this.hud.showToast('Some models could not load', 'Playing with the original models. Reload to retry.', 5); }

  /** Dev-only hooks for automated play-testing. */
  debugTeleport(x: number, z: number, yaw = 0): void {
    this.controller.teleport(new THREE.Vector3(x, this.world.heightAt(x, z), z), yaw);
    this.cam.snapBehind(this.controller.position, yaw);
  }

  /** Dev only: hand the player a team without the intro. */
  debugGiveParty(list: [string, number][] = [['fernfawn', 5], ['hjordpup', 5]]): void {
    const rng = new Rng(randomSeed());
    this.party.length = 0;
    for (const [sp, lv] of list) this.party.push(createCreature(sp, lv, rng, { ot: this.save.profile.name }));
    for (const f of ['met-professor', 'got-starter']) this.flags.add(f);
    this.save.flags = [...this.flags];
    this.updateNpcState();
    this.onPartyChanged();
  }

  /** Dev only: spawn a herd in front of the player and battle it. */
  debugWildBattle(speciesId = 'nibblet', level = 4): void {
    const p = this.controller.position;
    const yaw = this.controller.yaw;
    const herd = this.wild.spawnHerd(p.x + Math.sin(yaw) * 5, p.z + Math.cos(yaw) * 5, speciesId, level);
    void this.startWildBattle(herd.members[0], false);
  }

  /** Dev only: run game time faster (automated tests in slow headless browsers). */
  debugTimeScale = 1;

  /** Dev only: spawn a herd `dist` metres in front of the player. Returns how many creatures it has. */
  debugSpawnWild(speciesId = 'nibblet', level = 4, dist = 9): number {
    const p = this.controller.position;
    const yaw = this.controller.yaw;
    return this.wild.spawnHerd(p.x + Math.sin(yaw) * dist, p.z + Math.cos(yaw) * dist, speciesId, level).members.length;
  }

  /** Dev only: turn the camera so the crosshair sits on (x, y, z), as a player would with the mouse. */
  debugAimAt(x: number, y: number, z: number): void {
    const p = this.controller.position;
    let best = { yaw: Math.atan2(x - p.x, z - p.z), pitch: CAMERA_TUNING.defaultPitch, err: Infinity };
    const target = new THREE.Vector3(x, y, z);
    for (let pass = 0; pass < 2; pass++) {
      const yaws = pass ? [best.yaw - 0.06, best.yaw - 0.03, best.yaw, best.yaw + 0.03, best.yaw + 0.06] : [best.yaw];
      for (const yaw of yaws) {
        for (let pitch = CAMERA_TUNING.minPitch; pitch <= CAMERA_TUNING.maxPitch; pitch += 0.005) {
          this.cam.setLook(yaw, pitch);
          this.cam.update(1e-4, p, this.world, false);
          const cam = this.cam.camera;
          const toT = target.clone().sub(cam.position).normalize();
          const err = toT.angleTo(cam.getWorldDirection(new THREE.Vector3()));
          if (err < best.err) best = { yaw, pitch, err };
        }
      }
    }
    this.controller.yaw = best.yaw;
    this.cam.setLook(best.yaw, best.pitch);
    this.cam.update(1e-4, p, this.world, false);
  }

  /** Dev only: the current battle, for scripted tests. */
  get debugBattle(): BattleDirector | null {
    return this.battle?.director ?? null;
  }

  /** Compiles shaders up front so the first seconds of play aren't a stutter, then starts the loop. */
  async start(): Promise<void> {
    try {
      await this.renderer.compileAsync(this.scene, this.cam.camera);
    } catch {
      // Older drivers without parallel compile just compile on first draw.
    }
    this.started = true;
    this.hud.showToast('Bramblewick', 'Your hometown', 4);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Menu keys and Esc, delivered straight from the key event. */
  private onInstant(a: Action | 'pause'): void {
    if (!this.started) return;
    // Holding the throw key aims; the frame loop handles it (press, hold, release).
    if (a === 'throw') return;
    // Battles and scripted scenes own the keyboard.
    if ((this.battle && this.battle.closing === null) || this.remoteBattleHost) {
      if (a === 'pause') this.releaseMouse();
      return;
    }
    if (this.scripted) return;
    if (a === 'pause') {
      // The menu closes itself on Esc; while talking, Esc does nothing.
      if (!this.menu.isOpen && !this.talking) this.openMenu('settings');
      return;
    }
    if (!this.talking) this.onAction(a);
  }

  private joinRemoteBattle(id: string, frame: BattleFrame): void {
    this.remoteBattleHost = id; this.remoteFrame = frame;
    const balls = Object.fromEntries(Object.entries(this.save.bag ?? {}).filter(([b, n]) => ITEMS[b]?.category === 'balls' && n > 0));
    this.battleControl = {id:frame.id, join:{party:structuredClone(this.party),levelCap:this.levelCap,balls,catchMult:classInfo(this.save.profile.playerClass).modifiers.catchRate}};
    this.releaseMouse(); this.hud.setBattleMode(true); this.refreshFollower();
    this.hud.showToast('Joining your friend’s battle');
  }

  private receiveRemoteBattle(frame?: BattleFrame): void {
    if (!frame || (this.remoteFrame && frame.id !== this.remoteFrame.id)) {this.finishRemoteBattle(); return;}
    this.remoteFrame = frame;
    if (!frame.lobby && !frame.guest) {this.finishRemoteBattle(); this.hud.showToast('The battle has already started', 'Join before your friend chooses a mode.'); return;}
    if (frame.guest && !this.remoteBattle) {
      this.remoteBattle = new RemoteBattle(frame,this.world,this.scene,this.hud.el,this.portraits,c => {this.battleControl = {...this.battleControl,...c,join:undefined};},v => this.project(v));
    }
    this.remoteBattle?.receive(frame);
    for (const slot of frame.slots) if (slot.pos.side === 1) this.markDex(slot.species, false);
    if (frame.result) {
      const signature=JSON.stringify(frame.result.party);
      if(signature!==this.guestSaveSignature){
        this.guestSaveSignature=signature;
        for(const updated of frame.result.party){const c=this.party.find(c=>c.uid===updated.uid);if(c)Object.assign(c,updated);}
        writeSave(this.save);
      }
    }
    if (frame.ended && frame.result && !this.appliedBattleResults.has(frame.id)) {
      this.appliedBattleResults.add(frame.id);
      if(frame.winner === 0 && frame.progressionFlag) {this.setFlag(frame.progressionFlag);this.updateNpcState();}
      for (const updated of frame.result.party) {const c = this.party.find(c => c.uid === updated.uid); if(c) Object.assign(c,updated);}
      // Balls this trainer threw come out of their own bag; their catches join their own party.
      const bag = (this.save.bag ??= {});
      for (const [b, n] of Object.entries(frame.result.ballsUsed ?? {})) { bag[b] = Math.max(0, (bag[b] ?? 0) - n); if (!bag[b]) delete bag[b]; }
      void this.storeCaught(structuredClone(frame.result.caught ?? []));
      this.battleControl = {id:frame.id,ack:true}; this.onPartyChanged();
      this.guestProgression = {winner:frame.winner,escaped:frame.escaped,fainted:new Set(),pendingMoves:new Map(frame.result.pendingMoves),caught:[],ballsUsed:{},partnerCaught:[]};
    }
  }

  private finishRemoteBattle(): void {
    for (const updated of this.remoteFrame?.result?.party ?? []) {const c = this.party.find(c => c.uid === updated.uid); if(c) Object.assign(c,updated);}
    this.onPartyChanged();
    this.remoteBattle?.dispose(); this.remoteBattle = null; this.remoteBattleHost = null; this.remoteFrame = undefined;
    this.battleControl = undefined; this.hud.setBattleMode(false); this.refreshFollower();
    this.hud.showToast('Back to exploring');
    if (this.guestProgression) {const outcome = this.guestProgression; this.guestProgression = null; void (async()=>{await this.afterBattle(outcome);if(!this.party.some(isUsable))await this.blackout();})();}
  }

  private onAction(a: Action): void {
    const tabs: Partial<Record<Action, MenuTab>> = { map: 'map', bag: 'bag', party: 'party', quests: 'quests' };
    const tab = tabs[a];
    if (tab) {
      if (this.menu.isOpen && this.menu.current === tab) this.menu.close();
      else this.openMenu(tab);
    } else if (a === 'throw') {
      // The hotbar button: aiming needs a held key or mouse button.
      this.hud.showToast('Aim, then throw', `Hold ${keyLabel(this.settings.keys.throw)} or the right mouse button to aim, release to throw`, 3);
    } else if (a === 'partner') {
      // Something is charging you: the partner cuts it off instead of being called or recalled.
      const target = !this.battle && !this.scripted && !this.talking && !this.vitals.knockedDown ? this.interceptTarget() : null;
      if (target) {
        this.startIntercept(target);
        return;
      }
      if (!this.party.length) {
        this.hud.showToast('No Pokemon yet', 'Professor Hazel will give you your first partner', 2.5);
        return;
      }
      this.followerOut = !this.followerOut;
      this.refreshFollower();
      const lead = this.party.find(isUsable);
      if (lead) this.hud.showToast(this.followerOut ? `Come on out, ${displayName(lead)}!` : `${displayName(lead)}, return!`, '', 1.5);
    }
  }

  private openMenu(tab: MenuTab): void {
    this.input.clearHeld();
    this.releaseMouse();
    this.menu.open(tab);
  }

  private releaseMouse(): void {
    if (this.input.locked) this.suppressPause = true;
    this.input.releaseLock();
  }

  private applySettings(s: Settings): void {
    saveSettings(s);
    this.hud.applySettings(s);
    this.pipeline.setQuality(s.quality);
    this.world.setQuality?.(s.quality);
    const cam = this.cam as unknown as CameraSettingsHooks;
    cam.setSensitivity?.(s.mouseSensitivity);
    cam.setInvertY?.(false); // inversion is applied here, before the camera sees the mouse delta
    cam.setFov?.(s.fov);
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
    remote.setGround((x, z) => this.world.heightAt(x, z));
    this.scene.add(remote.root);
    this.partners.set(id, { remote, profile });
    const follower = new Follower();
    this.scene.add(follower.root);
    this.partnerFollowers.set(id, { follower, lead: null, last: new THREE.Vector3(), speed: 0 });
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
    const starter = this.party.length > 0;
    const beat = this.flags.has('beat-rival');
    const left = this.flags.has('left-town');
    const quests: Quest[] = [
      { id: 'meet', text: met ? 'Pick a partner at Hazel\'s lab' : 'Meet Professor Hazel', main: true, done: starter, target: { x: a.professor.x, z: a.professor.z } },
    ];
    if (starter) quests.push({ id: 'rival', text: 'Beat Sunniva', main: true, done: beat, target: { x: this.rival.homeSpot.x, z: this.rival.homeSpot.z } });
    if (beat) quests.push({ id: 'route1', text: 'Head out onto Route 1', main: true, done: left, target: { x: gate.x, z: gate.z } });
    if (beat && left) quests.push({ id: 'train', text: `Train your team on the meadow (cap Lv. ${this.levelCap})` });
    this.quests = quests;
    this.hud.setQuests(quests.slice(-3));
  }

  private get levelCap(): number {
    return levelCap(this.save.badges ?? 0);
  }

  private setFlag(flag: string): void {
    if (this.flags.has(flag)) return;
    this.flags.add(flag);
    this.save.flags = [...this.flags];
    writeSave(this.save);
    this.refreshQuests();
  }

  /** Quest markers and who stands where, from the story flags. */
  private updateNpcState(): void {
    const starter = this.party.length > 0;
    this.professor.setMarker(!starter);
    this.rival.setVisible(starter);
    this.rival.setMarker(starter && !this.flags.has('beat-rival'));
  }

  /** Party changed (battle, heal, reorder, evolution): save, HUD, follower. */
  private onPartyChanged(save = true): void {
    if (save) writeSave(this.save);
    this.hud.setParty(
      this.party.map((c) => ({
        name: displayName(c), species: c.species, level: c.level, hp: c.hp, maxHp: maxHp(c), status: c.status, portrait: this.portraits.get(c.species),
      })),
    );
    this.refreshFollower();
    this.refreshQuests();
    if (this.menu?.isOpen) this.menu.refresh();
  }

  private refreshFollower(): void {
    const lead = this.party.find(isUsable);
    this.follower.setSpecies(lead ? lead.species : null);
    this.follower.setVisible(this.followerOut && !this.battle && !this.remoteBattleHost);
  }

  private healParty(): void {
    for (const c of this.party) healCreature(c);
    this.onPartyChanged();
  }

  /** The house door the trainer is standing at, if any (either player's home will do). */
  private nearHome(pos: THREE.Vector3): { id: string; label: string } | null {
    return this.world.anchors.landmarks.find((l) => (l.id === 'p1-house' || l.id === 'p2-house') && Math.hypot(pos.x - l.position.x, pos.z - l.position.z) < HOME_RADIUS) ?? null;
  }

  /** Rest at home: a fade, then the whole team and the trainer are back to full. */
  private async restAtHome(): Promise<void> {
    this.cancelAim();
    this.beginScene();
    this.scripted = true;
    await this.hud.fade(true);
    for (const c of this.party) healCreature(c);
    this.vitals.restore();
    this.save.trainerHp = this.vitals.hp;
    this.onPartyChanged();
    await sleep(700);
    await this.hud.fade(false);
    this.endScene();
    this.hud.showToast('You rested at home', this.party.length ? 'You and your team are back to full health' : 'You feel much better', 2.5);
  }

  /** Start talking: freeze the player and free the mouse for dialogue choices. */
  private beginScene(): void {
    this.talking = true;
    this.input.clearHeld();
    this.releaseMouse();
    this.hud.setPrompt(null);
  }

  private endScene(): void {
    this.talking = false;
    this.scripted = false;
  }

  /** Open a supply cache, read a Lysfolk tablet or take a field note (DESIGN §12.3). */
  private async openDiscovery(spot: DiscoverySpot): Promise<void> {
    const d = spot.def, found = (this.save.found ??= []);
    if (found.includes(d.id)) return;
    found.push(d.id);
    this.discoveries.markFound(d.id);
    const count = discoveryCounts(found)[d.kind];
    const tally = `${DISCOVERY_LABEL[d.kind].many} found: ${count.found} of ${count.total}`;
    if (d.kind === 'cache') {
      const bag = (this.save.bag ??= {});
      const got = Object.entries(d.loot ?? {}).map(([id, n]) => {
        bag[id] = (bag[id] ?? 0) + n;
        const name = ITEMS[id]?.name ?? id;
        return n > 1 ? `${n} ${name}s` : `a ${name}`;
      });
      this.hud.showToast(`Found ${got.join(' and ')}`, tally, 3);
    } else {
      this.beginScene();
      const speaker = DISCOVERY_LABEL[d.kind].one;
      await this.hud.dialogue.play((d.text ?? []).map((text) => ({ speaker, text })));
      this.endScene();
      const owed = d.kind === 'tablet' && tabletReward(found, this.save.tabletsReported ?? 0).balls > 0;
      this.hud.showToast(tally, owed ? 'Professor Hazel will want to see a rubbing of these' : d.kind === 'note' ? 'Read it again from your quest log (J)' : '', 3);
    }
    writeSave(this.save);
    if (this.menu?.isOpen) this.menu.refresh();
  }

  /** Hazel pays a Great Ball for every few Lysfolk tablets, and knows her own lost notes. */
  private async reportFinds(): Promise<void> {
    const found = this.save.found ?? [];
    const reward = tabletReward(found, this.save.tabletsReported ?? 0);
    if (reward.balls > 0) {
      await this.hud.dialogue.play(this.professor.tabletLines(reward.balls));
      const bag = (this.save.bag ??= {});
      bag['great-ball'] = (bag['great-ball'] ?? 0) + reward.balls;
    }
    this.save.tabletsReported = reward.reported;
    if (!this.flags.has('hazel-notes') && discoveryCounts(found).note.found > 0) {
      await this.hud.dialogue.play(this.professor.fieldNoteLines());
      this.setFlag('hazel-notes');
    }
    writeSave(this.save);
  }

  private async talkToProfessor(): Promise<void> {
    this.beginScene();
    this.professor.lookAt(this.controller.position);
    const partner = [...this.partners.values()][0]?.profile.name ?? null;
    const first = !this.flags.has('met-professor');
    if (!this.party.length) {
      if (first) await this.hud.dialogue.play(this.professor.introLines(this.save.profile.name, partner));
      this.setFlag('met-professor');
      const [pick] = await this.hud.dialogue.play(this.professor.starterLines());
      this.giveStarter(STARTERS[pick] ?? STARTERS[0]);
      await this.hud.dialogue.play(this.professor.starterChosenLines(species(this.party[0].species).name));
      await this.giveBalls(5, true);
      this.professor.lookAt(null);
      await this.rivalChallenge();
      return;
    }
    if (this.party.some((c) => c.hp < maxHp(c) || c.status || c.moves.some((m) => m.pp < (moveData(m.id).pp ?? m.pp)))) {
      await this.hud.dialogue.play(this.professor.healLines());
      this.healParty();
    } else await this.hud.dialogue.play(this.professor.repeatLines());
    // Saves from before catching existed get the starter gift late; an empty bag gets a small refill.
    if (!this.flags.has('got-balls')) await this.giveBalls(5, true);
    else if (!this.ballCount()) await this.giveBalls(3, false);
    if (!this.flags.has('got-treats')) await this.giveTreats(3, true);
    else if (!this.save.bag?.[TREAT_ITEM]) await this.giveTreats(2, false);
    await this.reportFinds();
    this.professor.lookAt(null);
    this.endScene();
  }

  /**
   * Turn-based battles frame like Legends: Arceus: the trainer stands left of centre and the
   * camera looks past them into the ring, so they never block the Pokémon.
   */
  private battleFocus(ring: THREE.Vector3): THREE.Vector3 {
    const p = this.controller.position;
    const dx = ring.x - p.x;
    const dz = ring.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const fx = dx / d;
    const fz = dz / d;
    const ahead = Math.min(d * 0.4, 2.2);
    return this.tmpFocus.set(p.x + fx * ahead - fz * 1.1, p.y, p.z + fz * ahead + fx * 1.1);
  }
  private tmpFocus = new THREE.Vector3();

  /** The PC sits in Hazel's lab: close to the lab or to Hazel counts. */
  private nearPc(): boolean {
    const p = this.controller.position;
    const lab = this.world.anchors.landmarks.find((l) => l.id === 'lab')?.position ?? this.professor.position;
    return Math.hypot(p.x - lab.x, p.z - lab.z) < 14 || Math.hypot(p.x - this.professor.position.x, p.z - this.professor.position.z) < 6;
  }

  private ballCount(): number {
    const bag = this.save.bag ?? {};
    return Object.entries(bag).reduce((n, [id, c]) => n + (ITEMS[id]?.category === 'balls' ? c : 0), 0);
  }

  private async giveBalls(count: number, gift: boolean): Promise<void> {
    await this.hud.dialogue.play(gift ? this.professor.ballGiftLines(count) : this.professor.ballRefillLines(count));
    const bag = (this.save.bag ??= {});
    bag['poke-ball'] = (bag['poke-ball'] ?? 0) + count;
    this.setFlag('got-balls');
    writeSave(this.save);
    if (this.menu?.isOpen) this.menu.refresh();
  }

  private async giveTreats(count: number, gift: boolean): Promise<void> {
    await this.hud.dialogue.play(gift ? this.professor.treatGiftLines(count) : this.professor.treatRefillLines(count));
    const bag = (this.save.bag ??= {});
    bag[TREAT_ITEM] = (bag[TREAT_ITEM] ?? 0) + count;
    this.setFlag('got-treats');
    writeSave(this.save);
    if (this.menu?.isOpen) this.menu.refresh();
  }

  /** Record a species as seen, or caught (which implies seen). */
  private markDex(id: string, caught: boolean): void {
    const dex = (this.save.dex ??= { seen: [], caught: [] });
    if (!dex.seen.includes(id)) dex.seen.push(id);
    if (caught && !dex.caught.includes(id)) dex.caught.push(id);
  }

  /** Wild creatures caught in a battle join the party, or go to the PC box when it's full. */
  private async storeCaught(caught: Creature[]): Promise<void> {
    for (const c of caught) {
      c.ot = this.save.profile.name;
      this.markDex(c.species, true);
      if (this.party.length < PARTY_MAX) {
        this.party.push(c);
        this.hud.showToast(`${displayName(c)} joined your team!`, `Lv. ${c.level} ${species(c.species).name}`, 3);
      } else {
        (this.save.box ??= []).push(c);
        this.hud.showToast(`${displayName(c)} was sent to the PC`, 'Your party is full. Swap it in at Hazel\'s lab.', 3.5);
      }
    }
  }

  // ---- Overworld throws (DESIGN §5.1-5.4) -----------------------------------------------------

  /** Ball kinds in the bag, in item order. */
  private ballKinds(): string[] {
    const bag = this.save.bag ?? {};
    return Object.keys(ITEMS).filter((id) => ITEMS[id].category === 'balls' && (bag[id] ?? 0) > 0);
  }

  /** What can be thrown while aiming: the ball kinds in the bag, then Treats. */
  private throwKinds(): string[] {
    return [...this.ballKinds(), ...((this.save.bag?.[TREAT_ITEM] ?? 0) > 0 ? [TREAT_ITEM] : [])];
  }

  /**
   * Where a throw leaves the hand and how fast. The ball goes where the crosshair (the camera's
   * centre) points, on the flatter arc that reaches it; aimed at the sky or out of reach, it's a
   * long lob that rises with the camera.
   */
  private throwLaunch(): { from: Vec3; vel: Vec3; creature: WildCreature | null } {
    const yaw = this.cam.yaw;
    const p = this.controller.position;
    // Rei's right hand as the throw comes over: a little right of and in front of the shoulder.
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const from = { x: p.x - fz * 0.25 + fx * 0.2, y: p.y + 1.45, z: p.z + fx * 0.25 + fz * 0.2 };
    const cam = this.cam.camera;
    const hit = this.throws.aimRay(cam.position, cam.getWorldDirection(new THREE.Vector3()));
    const solved = hit && solveLaunch(from, hit.point);
    if (solved) return { from, vel: solved, creature: hit.creature };
    return { from, vel: launchVelocity(yaw, Math.min(Math.PI / 4, launchElevation(this.cam.pitch, CAMERA_TUNING.defaultPitch))), creature: null };
  }

  private startAim(): void {
    const kinds = this.throwKinds();
    if (!kinds.includes(this.aimBall)) this.aimBall = kinds[0];
    this.aiming = true;
    this.aimTime = 0;
    this.aimCamHold = 0;
    this.avatar.aim?.(true);
    this.cam.setAim(true);
    this.hud.setAiming(true);
  }

  /** Put the ball away without throwing. */
  private cancelAim(): void {
    if (!this.aiming) return;
    this.aiming = false;
    this.avatar.aim?.(false);
    this.cam.setAim(false);
    this.hud.setAiming(false);
    this.throws.hidePreview();
  }

  private releaseThrow(): void {
    const bag = (this.save.bag ??= {});
    const ball = this.aimBall;
    if (!bag[ball]) {
      this.cancelAim();
      this.hud.showToast(`No ${ITEMS[ball]?.name ?? 'balls'} left`, '', 1.8);
      return;
    }
    bag[ball]--;
    if (!bag[ball]) delete bag[ball];
    writeSave(this.save);
    const { from, vel } = this.throwLaunch();
    // The ball leaves the hand when the arm comes over: sooner from a full wind-up.
    const delay = Math.max(0.05, THROW_CLIP.release - Math.min(this.aimTime, THROW_CLIP.windup));
    const id = ++this.throwSeq;
    this.avatar.gesture('throw');
    this.throws.launch({ id, ball, from, vel, delay, local: true });
    this.netThrow = { fx: { id, ball, from: [from.x, from.y, from.z], vel: [vel.x, vel.y, vel.z] }, until: performance.now() + 1500 };
    this.aiming = false;
    this.hud.setAiming(false);
    this.throws.hidePreview();
    // Keep the shoulder view a moment to watch the ball fly.
    this.aimCamHold = 0.7;
    this.throwCooldown = 0.6;
    if (this.menu?.isOpen) this.menu.refresh();
  }

  /** Hold to aim, release to throw; E cancels and the wheel picks the ball. */
  private updateAim(dt: number, blocked: boolean): void {
    const input = this.input;
    this.throwCooldown = Math.max(0, this.throwCooldown - dt);
    if (this.aimCamHold > 0) {
      this.aimCamHold -= dt;
      if (this.aimCamHold <= 0 && !this.aiming) this.cam.setAim(false);
    }
    const able = !blocked && !this.vitals.knockedDown && !this.controller.climbing;
    if (this.aiming) {
      if (!able) {
        this.cancelAim();
        return;
      }
      this.aimTime += dt;
      if (input.consumeAction('interact')) {
        this.cancelAim();
        return;
      }
      const kinds = this.throwKinds();
      if (input.wheel && kinds.length > 1) {
        const i = Math.max(0, kinds.indexOf(this.aimBall));
        this.aimBall = kinds[(i + (input.wheel > 0 ? 1 : -1) + kinds.length) % kinds.length];
      }
      // Turn to face where the camera looks.
      const d = Math.atan2(Math.sin(this.cam.yaw - this.controller.yaw), Math.cos(this.cam.yaw - this.controller.yaw));
      this.controller.yaw += d * (1 - Math.exp(-18 * dt));
      if (input.consumeAimRelease() || input.consumeClick()) this.releaseThrow();
      return;
    }
    // A press starts aiming as soon as the trainer can (landing from a jump, a throw cooling down)
    // for as long as the key stays held.
    if (input.consumeAimPress()) this.aimWanted = true;
    if (!input.aimHeld) this.aimWanted = false;
    if (!this.aimWanted || !able || this.throwCooldown > 0 || !this.controller.grounded) return;
    this.aimWanted = false;
    if (!this.throwKinds().length) {
      this.hud.showToast('No Poke Balls', this.flags.has('got-balls') ? 'Professor Hazel can spare a few more' : 'Professor Hazel will give you some', 2.2);
      return;
    }
    this.startAim();
  }

  /** Arc preview and overlay, once the camera has moved this frame (so both match what's drawn). */
  private updateAimView(): void {
    if (!this.aiming) return;
    this.cam.camera.updateMatrixWorld();
    const { from, vel, creature } = this.throwLaunch();
    const target = this.throws.preview(from, vel);
    this.showAimHud(target, !!creature);
  }

  private showAimHud(target: WildCreature | null, onTarget: boolean): void {
    const bag = this.save.bag ?? {};
    let view;
    if (target) {
      const c = target.creature;
      const h = Math.max(0.35, target.model.height);
      const mid = target.root.position.clone().add(new THREE.Vector3(0, h * 0.5, 0));
      const scr = this.project(mid);
      const right = new THREE.Vector3(-Math.cos(this.cam.yaw), 0, Math.sin(this.cam.yaw));
      const edge = this.project(mid.clone().addScaledVector(right, Math.max(target.model.radius, h * 0.55) + 0.25));
      const p = this.controller.position;
      view = {
        name: displayName(c), level: c.level, hp: c.hp, maxHp: maxHp(c), x: scr.x, y: scr.y, visible: scr.visible,
        radius: Math.hypot(edge.x - scr.x, edge.y - scr.y),
        unaware: isUnaware({ state: target.state, alert: target.alert, x: target.mover.pos.x, z: target.mover.pos.z, yaw: target.mover.yaw, px: p.x, pz: p.z }),
      };
    }
    this.hud.aim.show({
      ball: this.aimBall, count: bag[this.aimBall] ?? 0, balls: this.throwKinds(), target: view, onTarget,
      throwKey: `${keyLabel(this.settings.keys.throw)} / RMB`, cancelKey: keyLabel(this.settings.keys.interact),
    });
  }

  /** A ball hit a wild creature: roll the catch (DESIGN §5.2) with the overworld or unaware modifier. */
  private overworldCatchRoll(m: WildCreature, ball: string, id: number, at: Vec3): CatchRoll {
    const c = m.creature;
    const p = this.controller.position;
    const unaware = isUnaware({ state: m.state, alert: m.alert, x: m.mover.pos.x, z: m.mover.pos.z, yaw: m.mover.yaw, px: p.x, pz: p.z });
    const chance = catchChance({
      maxHp: maxHp(c), hp: c.hp, catchRate: species(c.species).catchRate, ball, status: c.status, level: c.level,
      partyLevel: Math.max(1, ...this.party.map((x) => x.level)), cap: this.levelCap, throw: unaware ? 'unaware' : 'overworld',
      classMod: classInfo(this.save.profile.playerClass).modifiers.catchRate,
    });
    let roll = rollCatch(chance, this.catchRng);
    const forced = this.debugCatch?.caught;
    if (forced !== undefined) roll = forced ? { caught: true, shakes: 3 } : { caught: false, shakes: Math.min(2, roll.shakes) };
    this.wild.hold(m);
    this.markDex(c.species, false);
    this.lastCatch = { species: c.species, chance, unaware };
    this.netCatch = { fx: { id, ball, at: [at.x, at.y, at.z], shakes: roll.shakes, caught: roll.caught }, until: performance.now() + 1500 };
    return roll;
  }

  /** The shakes are done: it's caught, or it bursts out and reacts by temperament (DESIGN §5.3). */
  private overworldCatchResult(m: WildCreature, _ball: string, roll: CatchRoll): void {
    const c = m.creature;
    const name = displayName(c);
    if (roll.caught) {
      this.wild.caught(m);
      if (c.status === 'tox') c.status = 'psn';
      if (this.lastCatch) this.lastCatch.caught = true;
      void this.storeCaught([c]).then(() => this.onPartyChanged());
      return;
    }
    const ref = Math.min(Math.max(1, ...this.party.map((x) => x.level)), this.levelCap);
    const canBattle = this.party.some(isUsable);
    let reaction = failedCatchReaction(species(c.species).temperament, c.level - ref, this.catchRng.next(), canBattle);
    if (this.debugCatch?.reaction) reaction = this.debugCatch.reaction === 'battle' && !canBattle ? 'charge' : this.debugCatch.reaction;
    if (this.lastCatch) Object.assign(this.lastCatch, { caught: false, reaction });
    this.wild.breakOut(m, reaction);
    const near = ['Oh no! It broke free!', 'Aww! It appeared to be caught!', 'Argh! Almost had it!', 'Gah! It was so close, too!'][roll.shakes] ?? 'It broke free!';
    if (reaction === 'flee') this.hud.showToast(near, `The wild ${name} fled!`, 2.5);
    else if (reaction === 'startle') this.hud.showToast(near, `The wild ${name} backed off. It's wary of you now.`, 2.5);
    else if (reaction === 'charge') {
      const lead = this.party.find(isUsable);
      const ways = [`dodge with ${keyLabel(this.settings.keys.dodge)}`];
      if (lead) ways.push(`${keyLabel(this.settings.keys.partner)} sends ${displayName(lead)} to cut it off`);
      if (this.save.bag?.[TREAT_ITEM]) ways.push('a Treat calms it');
      this.hud.showToast(`The wild ${name} is furious!`, `It's charging you: ${ways.join(' · ')}`, 3.6);
    }
    else {
      this.hud.showToast(near, `The wild ${name} wants to fight!`, 2);
      this.pendingBattle = { m, t: 0.5 };
    }
  }

  /** A Treat landed, or bounced off a creature: whoever comes to eat it (DESIGN §5.3). */
  private onTreat(m: WildCreature | null, at: Vec3): void {
    const { eater, calmed } = this.wild.treat(at, m);
    if (!eater) {
      this.hud.showToast('The Treat landed', 'A Pokemon that wanders close will come and eat it', 2);
      return;
    }
    const name = displayName(eater.creature);
    if (calmed) this.hud.showToast(`The wild ${name} calmed down`, 'It went for the Treat instead of you', 2.4);
    else this.hud.showToast(`The wild ${name} went for the Treat`, 'Busy eating, it won\'t notice you unless it\'s already wary', 2.4);
  }

  /** A wild Pokemon charging the trainer, close enough for the partner to cut it off. */
  private interceptTarget(): WildCreature | null {
    if (this.intercept || this.remoteBattleHost || !this.party.some(isUsable)) return null;
    const p = this.controller.position;
    let best: WildCreature | null = null;
    let bd = INTERCEPT_RANGE;
    for (const m of this.wild.creatures) {
      if (m.state !== 'attack' || m.remoteBusy) continue;
      const d = Math.hypot(m.mover.pos.x - p.x, m.mover.pos.z - p.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  /** The partner Pokemon rushes the charging creature; the battle starts when it gets there. */
  private startIntercept(m: WildCreature): void {
    const lead = this.party.find(isUsable);
    if (!lead) return;
    this.cancelAim();
    this.followerOut = true;
    this.refreshFollower();
    this.intercept = { m, t: 0 };
    this.hud.showToast(`Go, ${displayName(lead)}!`, `Cut off the wild ${displayName(m.creature)}!`, 1.6);
  }

  private updateIntercept(dt: number): void {
    const i = this.intercept;
    if (!i) return;
    const m = i.m;
    i.t += dt;
    if (m.state !== 'attack' || m.remoteBusy || this.battle || this.vitals.knockedDown || !this.party.some(isUsable)) {
      this.intercept = null;
      this.follower.rushAt(null);
      return;
    }
    this.follower.rushAt(m.mover.pos);
    const f = this.follower.mover.pos;
    const there = Math.hypot(f.x - m.mover.pos.x, f.z - m.mover.pos.z) < m.model.radius + 1;
    if (there || i.t > 1.6 || !this.follower.active) {
      this.intercept = null;
      this.follower.rushAt(null);
      this.cancelAim();
      void this.startWildBattle(m, true, true);
    }
  }

  /** A charging creature connected: knocked down, HP lost, maybe knocked out. */
  private onTrainerHit(m: WildCreature): void {
    if (this.battle || this.remoteBattleHost || this.talking || this.scripted) return;
    // A well-timed dodge lets the lunge pass straight through.
    if (this.controller.invulnerable) return;
    const dmg = chargeDamage(m.creature.level);
    const r = this.vitals.hit(dmg);
    if (r === 'ignored') return;
    this.cancelAim();
    const p = this.controller.position;
    // Spun round to face what hit you, and shoved back along its lunge.
    this.controller.yaw = Math.atan2(m.mover.pos.x - p.x, m.mover.pos.z - p.z);
    const dx = m.attack?.dx ?? -Math.sin(this.controller.yaw);
    const dz = m.attack?.dz ?? -Math.cos(this.controller.yaw);
    this.controller.velocity.set(dx * 4.5, 2.2, dz * 4.5);
    this.controller.grounded = false;
    this.hud.hurt();
    if (r === 'out') {
      this.knockedOut = true;
      this.hud.showToast('You were knocked out!', `The wild ${displayName(m.creature)} was too much`, 2);
    } else this.hud.showToast(`The wild ${displayName(m.creature)} slammed into you!`, `-${dmg} HP`, 1.8);
    this.save.trainerHp = this.vitals.hp;
  }

  /** H: a Potion from the bag patches the trainer up. */
  private healSelf(): void {
    const bag = (this.save.bag ??= {});
    const name = ITEMS.bandage?.name ?? 'Potion';
    if (this.vitals.full) {
      this.hud.showToast('You\'re not hurt', '', 1.5);
      return;
    }
    if (!bag.bandage) {
      this.hud.showToast(`No ${name}s left`, 'Your HP comes back slowly while nothing is attacking you', 2.2);
      return;
    }
    const healed = this.vitals.heal(TRAINER_HP.potionHeal);
    bag.bandage--;
    if (!bag.bandage) delete bag.bandage;
    this.save.trainerHp = this.vitals.hp;
    writeSave(this.save);
    this.hud.showToast('You patched yourself up', `+${Math.round(healed)} HP · ${name} ×${bag.bandage ?? 0} left`, 2);
    if (this.menu?.isOpen) this.menu.refresh();
  }

  private pickupBall(id: number): void {
    const ball = this.throws.pickup(id);
    if (!ball) return;
    const bag = (this.save.bag ??= {});
    bag[ball] = (bag[ball] ?? 0) + 1;
    writeSave(this.save);
    this.hud.showToast(`Picked up a ${ITEMS[ball]?.name ?? 'ball'}`, `×${bag[ball]} in your bag`, 1.6);
    if (this.menu?.isOpen) this.menu.refresh();
  }

  private giveStarter(starter: string): void {
    const rng = new Rng(randomSeed());
    const ot = this.save.profile.name;
    this.party.push(createCreature(starter, 5, rng, { ot }), createCreature('hjordpup', 5, rng, { ot }));
    for (const c of this.party) this.markDex(c.species, true);
    this.save.starter = starter;
    this.setFlag('got-starter');
    this.updateNpcState();
    this.onPartyChanged();
    this.hud.showToast(`${species(starter).name} joined your team!`, 'Hjordpup came along too', 3);
  }

  /** Sunniva runs out of the lab and challenges the player on the spot. */
  private async rivalChallenge(): Promise<void> {
    this.scripted = true;
    const lab = this.world.anchors.landmarks.find((l) => l.id === 'lab')?.position ?? this.professor.position;
    this.rival.place(lab.clone().add(new THREE.Vector3(1.6, 0, 2.4)), 0);
    this.rival.setVisible(true);
    const p = this.controller.position;
    const toPlayer = new THREE.Vector3(p.x - this.rival.position.x, 0, p.z - this.rival.position.z).normalize();
    await Promise.race([this.rival.walkTo(p.clone().addScaledVector(toPlayer, -2.4), true), sleep(4000)]);
    this.rival.lookAt(this.controller.position);
    this.professor.lookAt(this.rival.position);
    await this.hud.dialogue.play(this.rival.challengeLines(this.save.profile.name, species(this.party[0].species).name));
    this.professor.lookAt(null);
    await this.rivalBattle();
  }

  private async talkToRival(): Promise<void> {
    this.beginScene();
    this.rival.lookAt(this.controller.position);
    if (this.flags.has('beat-rival')) {
      await this.hud.dialogue.play(this.rival.idleLines());
      this.rival.lookAt(null);
      this.endScene();
      return;
    }
    const [pick] = await this.hud.dialogue.play(this.rival.rematchLines());
    if (pick !== 0) {
      this.rival.lookAt(null);
      this.endScene();
      return;
    }
    if (!this.party.some(isUsable)) {
      await this.hud.dialogue.play([{ speaker: this.rival.name, text: "Your team can't even stand up. Get them healed by Aunt Hazel first." }]);
      this.rival.lookAt(null);
      this.endScene();
      return;
    }
    this.scripted = true;
    await this.rivalBattle();
  }

  private async rivalBattle(): Promise<void> {
    // The ring opens towards the plaza, with Sunniva on its far side.
    const p = this.controller.position.clone();
    const facing = Math.atan2(TOWN.x - p.x, TOWN.z - p.z);
    const spot = arenaSpots(p, facing).foeTrainer;
    this.rival.lookAt(null);
    this.rival.setMarker(false);
    await Promise.race([this.rival.walkTo(spot, true), sleep(3500)]);
    this.rival.place(spot, facing + Math.PI);
    this.rival.lookAt(p);
    this.talking = false;
    const outcome = await this.runBattle({
      kind: 'trainer',
      progressionFlag:'beat-rival',
      foes: this.rival.team(this.save.starter ?? this.party[0].species, randomSeed()),
      foeName: this.rival.name,
      foeAi: 't1',
      playerPos: p,
      facing,
      intro: `${this.rival.name} wants to battle!`,
    });
    this.beginScene();
    this.scripted = true;
    const won = outcome.winner === 0;
    this.rival.lookAt(this.controller.position);
    await this.hud.dialogue.play(won ? this.rival.winLines() : this.rival.loseLines());
    if (won) {
      this.setFlag('beat-rival');
      this.hud.showToast('New quest', 'Head out onto Route 1');
    }
    if (this.party.some((c) => c.hp < maxHp(c) || c.status)) {
      this.professor.lookAt(this.controller.position);
      await this.hud.dialogue.play(this.professor.healLines());
      this.healParty();
      this.professor.lookAt(null);
    }
    this.updateNpcState();
    this.rival.lookAt(null);
    void this.rival.goHome();
    this.endScene();
  }

  /**
   * Walk up to a wild Pokemon and press interact, or get charged by one. A partner that
   * `intercepted` a charge takes it on alone: its herd-mate doesn't get the chance to join in.
   */
  private async startWildBattle(m: WildCreature, charged: boolean, intercepted = false): Promise<void> {
    const list = intercepted ? [m] : this.wild.opponentsFor(m);
    this.wild.enterBattle(list);
    const p = this.controller.position.clone();
    const facing = Math.atan2(m.mover.pos.x - p.x, m.mover.pos.z - p.z);
    const names = list.map((w) => displayName(w.creature));
    const lead = this.party.find(isUsable);
    const intro = intercepted && lead
      ? `${displayName(lead)} cut off the wild ${names[0]}!`
      : charged
      ? `A wild ${names[0]} charged at you!${names[1] ? ` Another ${names[1]} joined in!` : ''}`
      : names.length > 1 ? `You challenged a wild ${names[0]} and ${names[1]}!` : `You challenged a wild ${names[0]}!`;
    const outcome = await this.runBattle({
      kind: 'wild',
      foes: list.map((w) => w.creature),
      foeName: 'Wild',
      foeAi: 'wild',
      wildActors: list.map((w) => ({ uid: w.creature.uid, root: w.root, model: w.model })),
      playerPos: p,
      facing,
      intro,
    });
    this.wild.leaveBattle(list, outcome.fainted, new Set([...outcome.caught, ...outcome.partnerCaught].map((c) => c.uid)));
    if (outcome.winner === 1) await this.blackout();
  }

  private async runBattle(start: Omit<BattleStart, 'playerName' | 'party' | 'levelCap' | 'xpMult'>): Promise<BattleOutcome> {
    this.input.clearHeld();
    this.releaseMouse();
    this.hud.setPrompt(null);
    this.hud.setBattleMode(true);
    if (this.menu.isOpen) this.menu.close();
    // Turn to face the ring.
    this.controller.teleport(this.controller.position.clone(), start.facing);
    for (const f of start.foes) this.markDex(f.species, false);
    const bag = (this.save.bag ??= {});
    const balls = Object.fromEntries(Object.entries(bag).filter(([id, n]) => ITEMS[id]?.category === 'balls' && n > 0));
    const director = new BattleDirector(
      {
        world: this.world,
        scene: this.scene,
        camera: this.cam.camera,
        hudRoot: this.hud.el,
        portraits: this.portraits,
        connected: this.partners.size > 0,
        trainerPosition: () => this.controller.position,
        soloMode: this.settings.battleMode === 'ask' ? undefined : this.settings.battleMode,
        project: (v) => this.project(v),
        onThrow: (side) => (side === 0 ? this.avatar.gesture('throw') : start.kind === 'trainer' && this.rival.gesture('throw')),
      },
      {
        ...start,
        playerName: this.save.profile.name,
        party: this.party,
        levelCap: this.levelCap,
        xpMult: 1,
        balls,
        catchMult: classInfo(this.save.profile.playerClass).modifiers.catchRate,
      },
    );
    const active: ActiveBattle = { director, wild: [], closing: null };
    this.battle = active;
    this.refreshFollower();
    let outcome: BattleOutcome;
    try {
      outcome = await director.run();
    } finally {
      director.ui.hide();
      director.stage.close();
      active.closing = 0.9;
      this.hud.setBattleMode(false);
      this.cam.snapBehind(this.controller.position, this.controller.yaw);
    }
    for (const [id, n] of Object.entries(outcome.ballsUsed)) {
      bag[id] = Math.max(0, (bag[id] ?? 0) - n);
      if (!bag[id]) delete bag[id];
    }
    await this.storeCaught(outcome.caught);
    this.onPartyChanged();
    await this.afterBattle(outcome);
    return outcome;
  }

  /** Moves to learn and evolutions, asked once the ring is gone. */
  private async afterBattle(outcome: BattleOutcome): Promise<void> {
    const pending = [...outcome.pendingMoves].filter(([uid]) => this.party.some((c) => c.uid === uid));
    const evolving = this.party.filter((c) => {
      const evo = species(c.species).evolution;
      return evo && c.level >= evo.level && c.hp > 0;
    });
    if (!pending.length && !evolving.length) return;
    this.beginScene();
    for (const [uid, moves] of pending) {
      const c = this.party.find((x) => x.uid === uid);
      if (c) await this.learnMoves(c, moves);
    }
    for (const c of evolving) {
      const evo = species(c.species).evolution!;
      const before = displayName(c);
      const [pick] = await this.hud.dialogue.play([{ speaker: '', text: `What? ${before} is evolving!`, choices: ['Let it evolve', 'Stop it'] }]);
      if (pick !== 0) {
        await this.hud.dialogue.play([{ speaker: '', text: `${before} stopped evolving.` }]);
        continue;
      }
      const res = evolve(c, evo.into);
      await this.hud.dialogue.play([{ speaker: '', text: `Congratulations! ${before} evolved into ${species(evo.into).name}!` }]);
      for (const id of res.learned) await this.hud.dialogue.play([{ speaker: '', text: `${displayName(c)} learned ${moveData(id).name}!` }]);
      if (res.pendingMoves.length) await this.learnMoves(c, res.pendingMoves);
    }
    this.onPartyChanged();
    this.endScene();
  }

  private async learnMoves(c: Creature, moves: string[]): Promise<void> {
    const name = displayName(c);
    for (const id of moves) {
      if (c.moves.some((m) => m.id === id)) continue;
      const mv = moveData(id);
      if (c.moves.length < 4) {
        c.moves.push({ id, pp: mv.pp });
        await this.hud.dialogue.play([{ speaker: '', text: `${name} learned ${mv.name}!` }]);
        continue;
      }
      const info = `${mv.type}, ${mv.category}${mv.power ? `, power ${mv.power}` : ''}`;
      const [pick] = await this.hud.dialogue.play([
        { speaker: '', text: `${name} wants to learn ${mv.name} (${info}). ${mv.description} Forget a move to make room?`, choices: [...c.moves.map((m) => `Forget ${moveData(m.id).name}`), `Don't learn it`] },
      ]);
      if (pick < c.moves.length) {
        const old = moveData(c.moves[pick].id).name;
        teachMove(c, id, pick);
        await this.hud.dialogue.play([{ speaker: '', text: `1, 2 and... poof! ${name} forgot ${old} and learned ${mv.name}!` }]);
      } else await this.hud.dialogue.play([{ speaker: '', text: `${name} did not learn ${mv.name}.` }]);
    }
  }

  /**
   * Every Pokemon fainted, or the trainer was knocked out: back to Hazel's lab, everyone patched
   * up, with a word from the professor.
   */
  private async blackout(reason: 'team' | 'trainer' = 'team'): Promise<void> {
    this.cancelAim();
    this.beginScene();
    this.scripted = true;
    const text = reason === 'trainer'
      ? 'Everything went dark... Someone found you in the grass and helped you back to Bramblewick.'
      : 'You have no Pokemon left that can fight. You hurried back to Bramblewick to protect them...';
    await this.hud.dialogue.play([{ speaker: '', text }]);
    await this.hud.fade(true);
    const a = this.world.anchors;
    const spot = a.professor.clone().add(new THREE.Vector3(0, 0, 2.4));
    this.controller.teleport(new THREE.Vector3(spot.x, this.world.heightAt(spot.x, spot.z), spot.z), Math.PI);
    this.cam.snapBehind(this.controller.position, Math.PI);
    this.wild.clear();
    // Balls still in the air are gone; missed balls stay where they fell.
    this.throws.clear(true);
    this.pendingBattle = null;
    this.vitals.restore();
    this.knockedOut = false;
    this.save.trainerHp = this.vitals.hp;
    for (const c of this.party) healCreature(c);
    this.onPartyChanged();
    await sleep(400);
    await this.hud.fade(false);
    this.professor.lookAt(this.controller.position);
    await this.hud.dialogue.play(this.professor.blackoutLines());
    this.professor.lookAt(null);
    this.endScene();
  }

  /** World point to CSS pixels. */
  private project(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const p = v.clone().project(this.cam.camera);
    const w = this.parent.clientWidth || innerWidth;
    const ht = this.parent.clientHeight || innerHeight;
    return { x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * ht, visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
  }

  debugAdvance(ms: number): void { for (let t = 0; t < ms; t += 1000 / 60) this.frame(1 / 60); }

  debugText(): string {
    return JSON.stringify({ mode: this.battle ? 'battle' : this.talking ? 'dialogue' : this.menu.isOpen ? 'menu' : 'overworld', coordinates: 'Y up; north +Z; east -X', player: this.controller.snapshot(), trainer: this.avatar.root.userData.trainerModel, trainerClip:this.avatar.root.userData.currentClip, climbing:this.controller.climbing, found:this.save.found?.length ?? 0, party: this.party.map((p) => ({ species: p.species, name: displayName(p), level: p.level, hp: p.hp })), follower: this.follower.model?.root.userData.pokemon, wild: this.wild.root.children.length, partners: [...this.partners.values()].map((p) => ({ name: p.profile.name, trainer: p.remote.avatar.root.userData.trainerModel, position: p.remote.root.position.toArray() })), battle: this.battle?.director.snapshot() ?? this.remoteFrame ?? null,
      trainerHp: { hp: Math.round(this.vitals.hp * 10) / 10, max: this.vitals.max, down: this.vitals.knockedDown },
      throwing: { aiming: this.aiming, ball: this.aimBall, balls: Object.fromEntries(this.throwKinds().map((b) => [b, this.save.bag?.[b] ?? 0])), treats: this.wild.treats.length, intercept: this.intercept ? displayName(this.intercept.m.creature) : null, inFlight: this.throws.busy, dropped: this.throws.droppedCount, lastCatch: this.lastCatch },
      wildCreatures: this.wild.creatures.map((m) => ({ species: m.creature.species, level: m.creature.level, state: m.state, alert: Math.round(m.alert), attack: m.attack?.phase, position: [m.mover.pos.x, m.mover.pos.z].map((v) => Math.round(v * 10) / 10) })) });
  }

  private frame(step?: number): void {
    this.timer.update();
    const dt = (step ?? Math.min(this.timer.getDelta(), 0.1)) * this.debugTimeScale;
    this.elapsed += dt;
    this.gameMinutes += dt; // one real second is one in-game minute
    const now = performance.now();
    const input = this.input;

    const battle = this.battle;
    const inBattle = (!!battle && battle.closing === null) || !!this.remoteBattleHost;
    const busy = this.talking || this.menu.isOpen || inBattle || this.scripted;
    const view = this.remoteFrame;
    const actionMode = inBattle && !battle?.director.lobby && (battle?.director.mode === 'action' || view?.mode === 'action');
    const battleUi = battle?.director.ui ?? this.remoteBattle?.ui;
    if (inBattle && input.consume('Tab') && battleUi) {
      if (battleUi.toggleControls()) this.releaseMouse(); else input.requestLock();
    }
    if (input.locked && !this.menu.isOpen) {
      this.cam.onMouseDelta(input.mouseDX, input.mouseDY * (this.settings.invertY ? -1 : 1));
      // While aiming the wheel picks the ball instead of zooming.
      if (!this.aiming) this.cam.onWheel(input.wheel);
    }

    this.hud.setPointerLocked(input.locked || this.talking || this.menu.isOpen || inBattle || this.scripted);
    const move = input.move();
    if (this.talking) {
      if (input.consumeAction('interact') || input.consume('Space') || input.consume('Enter')) this.hud.dialogue.next();
    }
    this.updateAim(dt, busy);
    if (!busy && input.consumeAction('heal')) this.healSelf();
    const knocked = this.vitals.knockedDown;
    if (actionMode) {
      const x = Math.sin(this.cam.yaw) * move.forward - Math.cos(this.cam.yaw) * move.right;
      const z = Math.cos(this.cam.yaw) * move.forward + Math.sin(this.cam.yaw) * move.right;
      const movement = {x,z,sprint:move.sprint,dodge:move.jump};
      if (battle) battle.director.stage.pilot({side:0,slot:0},movement);
      else if (view) this.battleControl = {...this.battleControl, id:view.id, movement:{...movement,dodgeToken:(this.battleControl?.movement?.dodgeToken ?? 0)+(move.jump ? 1 : 0)}};
    }
    // Aiming roots the trainer (they turn with the camera); a knockdown takes control away.
    if (this.talking || this.menu.isOpen || (this.scripted && !inBattle) || actionMode || knocked || this.aiming) {
      move.forward = move.right = 0;
      move.jump = move.sprint = move.climb = move.dodge = false;
    }
    this.controller.update(dt, move, this.cam.yaw, this.world);
    const snap = this.controller.snapshot();
    this.avatar.root.position.copy(this.controller.position);
    this.avatar.root.rotation.y = this.controller.yaw;
    // Knockdown: tip over backwards, lie there, get up (the landing clip plays as they rise).
    const downT = this.vitals.downTime;
    const down = knockdownTilt(downT);
    this.avatar.root.rotation.x = -down * KNOCKDOWN_ANGLE;
    if (knocked && downT < TRAINER_HP.knockdown - 0.7) snap.anim = 'fall';
    this.avatar.animate(dt, snap);
    this.vitals.update(dt, inBattle || this.wild.attacking);
    this.save.trainerHp = this.vitals.hp;
    this.hud.setTrainerHp(this.vitals.hp, this.vitals.max);
    if (this.knockedOut && !busy && (!knocked || downT > 0.9)) {
      this.knockedOut = false;
      void this.blackout('trainer');
    }
    if (battle) {
      if (battle.closing === null) battle.director.update(dt);
      else {
        // The ring fades out while the normal camera takes over again.
        battle.director.stage.update(dt);
        battle.closing -= dt;
        if (battle.closing <= 0) {
          battle.director.dispose();
          this.battle = null;
          this.refreshFollower();
        }
      }
    }
    this.remoteBattle?.update(dt);
    const ring = battle && battle.closing === null ? battle.director.stage.center : this.remoteBattle?.stage.center;
    const focus = actionMode ? battle?.director.stage.spot({side:0,slot:0}) ?? this.remoteBattle?.focus ?? this.controller.position : ring ? this.battleFocus(ring) : this.controller.position;
    this.cam.update(dt, focus, this.world, move.sprint && snap.speed > 5);
    this.updateAimView();

    // Interaction
    if (!busy) {
      const pos = this.controller.position;
      const nearProf = pos.distanceTo(this.professor.position) < TALK_RADIUS;
      const nearRival = this.rival.visible && pos.distanceTo(this.rival.position) < TALK_RADIUS;
      const pickup = !nearProf && !nearRival && !this.aiming ? this.throws.nearestPickup(pos) : null;
      const find = !nearProf && !nearRival && !pickup && !this.aiming ? this.discoveries.nearest(pos) : null;
      const home = !nearProf && !nearRival && !pickup && !find ? this.nearHome(pos) : null;
      const wildMon = !nearProf && !nearRival ? this.wild.nearestEngageable(pos) : null;
      const canFight = this.party.some(isUsable);
      const invite = [...this.partnerBattles].find(([,f]) => f.joinable && Math.hypot(pos.x-f.center[0],pos.z-f.center[2]) < 14);
      const chargingAt = !knocked ? this.interceptTarget() : null;
      const lead = this.party.find(isUsable);
      // Lying on the ground: no prompts until back on your feet.
      if (knocked) this.hud.setPrompt(null);
      else if (chargingAt && lead) this.hud.setPrompt(`Send ${displayName(lead)} to cut off the wild ${displayName(chargingAt.creature)}`, keyLabel(this.settings.keys.partner));
      else if (invite && canFight) this.hud.setPrompt('Join your friend’s battle');
      else if (nearProf) this.hud.setPrompt(`Talk to ${this.professor.name}`);
      else if (nearRival) this.hud.setPrompt(`Talk to ${this.rival.name}`);
      else if (pickup) this.hud.setPrompt(`Pick up the ${ITEMS[pickup.ball]?.name ?? 'ball'}`);
      else if (find) this.hud.setPrompt(DISCOVERY_LABEL[find.def.kind].prompt);
      else if (home) this.hud.setPrompt(`Rest at ${home.id === 'p1-house' ? 'home' : 'your friend’s house'}`);
      else if (wildMon) this.hud.setPrompt(canFight ? `Battle the wild ${displayName(wildMon.creature)} · Lv. ${wildMon.creature.level}` : `Wild ${displayName(wildMon.creature)} · you have no Pokemon that can battle`);
      else if(this.controller.onLadder)this.hud.setPrompt(`${keyLabel(this.settings.keys.forward)} up · ${keyLabel(this.settings.keys.back)} down · ${keyLabel(this.settings.keys.jump)} let go`,'');
      else if(this.controller.onWall)this.hud.setPrompt(`${[this.settings.keys.forward,this.settings.keys.left,this.settings.keys.back,this.settings.keys.right].map(keyLabel).join(' ')} climb · ${keyLabel(this.settings.keys.jump)} leap · ${keyLabel(this.settings.keys.back)} + ${keyLabel(this.settings.keys.jump)} kick off · ${keyLabel(this.settings.keys.climb)} let go`,'');
      else if(this.controller.nearClimb(this.world))this.hud.setPrompt('Walk into the ladder to climb the lookout',keyLabel(this.settings.keys.forward));
      else this.hud.setPrompt(null);
      if (!knocked && input.consumeAction('interact')) {
        if (invite && canFight) this.joinRemoteBattle(invite[0],invite[1]);
        else if (nearProf) void this.talkToProfessor();
        else if (nearRival) void this.talkToRival();
        else if (pickup) this.pickupBall(pickup.id);
        else if (find) void this.openDiscovery(find);
        else if (home) void this.restAtHome();
        else if (wildMon && canFight) void this.startWildBattle(wildMon, false);
      }
      // A creature that broke out of a ball and wants a fight starts it once it has popped out.
      const pending = this.pendingBattle;
      if (pending && (pending.t -= dt) <= 0) {
        this.pendingBattle = null;
        const m = pending.m;
        if (m.state !== 'gone' && m.state !== 'battle' && m.state !== 'ball' && canFight && !this.battle) {
          this.cancelAim();
          void this.startWildBattle(m, true);
        } else if (m.state !== 'gone' && m.state !== 'battle') this.wild.breakOut(m, 'startle');
      }

      this.updateIntercept(dt);

      // A territorial Pokemon that reaches you starts the fight itself.
      const charger = this.battle ? null : this.wild.charger(pos);
      if (charger) {
        if (canFight) void this.startWildBattle(charger, true);
        else {
          charger.state = 'graze';
          charger.calm = 20;
          this.hud.showToast(`The wild ${displayName(charger.creature)} lost interest`, 'Rest at home or see Hazel at the lab', 2.5);
        }
      }
    } else if (this.menu.isOpen || inBattle) {
      this.hud.setPrompt(null);
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
    this.rival.update(dt);
    const friends = [...this.partnerWild.values()];
    this.wild.setRemoteBusy(new Set(friends.flatMap((f) => f.busy)));
    this.wild.setFriendCells(friends.flatMap((f) => f.cells));
    this.wild.update(dt, this.controller.position, snap.speed, move.sprint && snap.speed > 5, busy);
    this.follower.update(dt, this.controller.position, this.controller.yaw, snap.speed, this.world);
    for (const [id, p] of this.partners) {
      p.remote.update(dt, now);
      const pf = this.partnerFollowers.get(id);
      if (!pf) continue;
      const rp = p.remote.root.position;
      pf.speed += (rp.distanceTo(pf.last) / Math.max(dt, 1e-3) - pf.speed) * Math.min(1, dt * 8);
      pf.last.copy(rp);
      pf.follower.setSpecies(pf.lead);
      pf.follower.setVisible(!!pf.lead && p.remote.root.visible);
      pf.follower.update(dt, rp, p.remote.avatar.root.rotation.y, pf.speed, this.world);
    }
    this.throws.update(dt);
    // A furious creature's lunge that connects knocks the trainer down.
    for (const m of this.wild.consumeHits()) if (!busy) this.onTrainerHit(m);
    const lead = this.follower.active ? this.follower.species ?? undefined : undefined;
    const ballThrow = this.netThrow && now < this.netThrow.until ? this.netThrow.fx : undefined;
    const ballCatch = this.netCatch && now < this.netCatch.until ? this.netCatch.fx : undefined;
    const wildTaken = this.wild.sharedTaken;
    const wildBusy = this.wild.sharedBusy;
    const wildCells = this.wild.liveCells;
    this.net.send({ ...snap, lead, battle: inBattle || undefined, battleFrame: battle?.director.snapshot(), battleControl: this.battleControl, ballThrow, ballCatch, down: down > 0 ? Math.round(down * 100) / 100 : undefined, wildTaken: wildTaken.length ? wildTaken : undefined, wildBusy: wildBusy.length ? wildBusy : undefined, wildCells: wildCells.length ? wildCells : undefined }, now);

    // Also keeps the sun's shadow camera centred on the player.
    this.world.update(dt, this.elapsed, this.controller.position);
    this.discoveries.update(dt, this.elapsed, this.controller.position);

    const partner = [...this.partners.values()][0]?.remote.root.position;
    this.hud.update(
      dt,
      { x: snap.x, z: snap.z, yaw: this.controller.yaw },
      this.cam.yaw,
      this.controller.stamina,
      this.controller.exhausted ?? false,
      this.world.anchors.landmarks.map((l) => ({ x: l.position.x, z: l.position.z, label: l.label })).concat(this.destination ? [this.destination] : []),
      partner ? { x: partner.x, z: partner.z } : undefined,
      this.gameMinutes,
    );

    this.menu.update();
    this.pipeline.render(dt);
    input.endFrame();
  }

  private resize(): void {
    const w = this.parent.clientWidth || innerWidth;
    const ht = this.parent.clientHeight || innerHeight;
    this.pipeline.setSize(w, ht);
    this.cam.camera.aspect = w / ht;
    this.cam.camera.updateProjectionMatrix();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
