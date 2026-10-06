import type { MajorStatus } from '../../shared/battle/types';
import { PLAYER_CLASSES } from '../../shared/classes';
import type { PlayerProfile } from '../../shared/types';
import type { World } from '../world/types';
import { keyLabel, type Action, type Settings } from '../core/settings';
import { AimHud } from './aim-hud';
import { DialogueBox } from './dialogue';
import { h } from './dom';
import { Minimap } from './minimap';

export interface Quest {
  id: string;
  text: string;
  main?: boolean;
  done?: boolean;
  /** World point the compass and minimap point at while the quest is active. */
  target?: { x: number; z: number };
}

/** One creature in the party strip, top left (as in the art reference). */
export interface PartyEntry {
  name: string;
  species: string;
  level: number;
  hp: number;
  maxHp: number;
  status?: MajorStatus;
  portrait: string;
}

const STATUS_SHORT: Record<MajorStatus, string> = { brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ' };

const DIRS: [number, string, boolean][] = [
  [0, 'N', true], [45, 'NE', false], [90, 'E', true], [135, 'SE', false],
  [180, 'S', true], [225, 'SW', false], [270, 'W', true], [315, 'NW', false],
];
/** Degrees visible across the compass strip. */
const COMPASS_SPAN = 180;

export class Hud {
  readonly el: HTMLDivElement;
  readonly dialogue = new DialogueBox();
  readonly aim = new AimHud();
  private compass = h('div.compass');
  private clock = h('div.clock');
  private quests = h('div.quests');
  readonly minimap: Minimap;
  private hotbar = h('div.hotbar');
  private help = h('div.help');
  private fps = h('div.fps');
  private fpsFrames = 0;
  private fpsTime = 0;
  private stamina = h('i');
  private staminaBar = h('div.bar.stamina', {}, this.stamina);
  private hpFill = h('i');
  private hpBar = h('div.bar', {}, this.hpFill);
  private hpText = h('small');
  private vitals!: HTMLElement;
  private hurtFlash = h('div.hurt-flash');
  private lastHp = '';
  private prompt = h('div.prompt');
  private net = h('div.net');
  private toast = h('div.toast');
  private clickToPlay = h('button.click-to-play', {type:'button'}, 'Click to play');
  private fadeEl = h('div.fade');
  private party = h('div.party', {}, h('div.party-empty', {}, 'No Pokemon yet. Professor Hazel is waiting at her lab.'));
  private hasParty = false;
  private lastSettings: Settings | null = null;
  private questList: Quest[] = [];
  private toastTimer = 0;

  constructor(world: World, profile: PlayerProfile, onClickToPlay: () => void, private onHotbar: (a: Action) => void) {
    this.minimap = new Minimap(world);
    const cls = PLAYER_CLASSES.find((c) => c.id === profile.playerClass) ?? PLAYER_CLASSES[0];
    this.clickToPlay.addEventListener('click', onClickToPlay);
    this.el = h(
      'div.hud',
      {},
      this.compass,
      this.clock,
      h('div.minimap', {}, this.minimap.canvas),
      this.quests,
      this.party,
      (this.vitals = h(
        'div.vitals',
        {},
        h('div.badge', { style: `background:${cls.color}` }, cls.name[0]),
        h(
          'div.info',
          {},
          h('div.name', {}, `${profile.name} · ${cls.name} · Lv. 1`),
          // The trainer's own HP only shows once something has hurt them.
          h('div.trainer-hp', { title: 'Your HP' }, this.hpBar, this.hpText),
          this.staminaBar,
        ),
      )),
      this.hotbar,
      this.help,
      this.fps,
      this.hurtFlash,
      this.aim.el,
      this.prompt,
      this.net,
      this.toast,
      this.fadeEl,
      this.dialogue.el,
      this.clickToPlay,
    );
  }

  /** Refresh key labels and hint visibility after settings change. */
  applySettings(s: Settings): void {
    this.lastSettings = s;
    const k = (a: Action) => h('span.key', {}, keyLabel(s.keys[a]));
    this.hotbar.replaceChildren(
      this.hot('◓', 'throw', `Hold ${keyLabel(s.keys.throw)} or right mouse to aim a ball, release to throw`, s, !this.hasParty),
      this.hot('🐾', 'partner', this.hasParty ? 'Call or recall your partner' : 'No partner Pokemon yet', s, !this.hasParty),
      this.hot('🗺', 'map', 'Map', s),
      this.hot('🎒', 'bag', 'Bag', s),
    );
    this.help.replaceChildren(
      k('forward'), k('left'), k('back'), k('right'), ' move  ', k('sprint'), ' sprint  ', k('jump'), ' jump  ', k('dodge'), ' dodge  ', k('climb'), ' climb  ', k('interact'), ' talk / battle  ',
      k('throw'), ' hold: aim & throw  ', k('party'), ' party  ', k('map'), ' map  ', k('bag'), ' bag  ', h('span.key', {}, 'Esc'), ' menu',
    );
    this.help.style.display = s.showControlsHint ? '' : 'none';
    this.fps.classList.toggle('show', s.showFps);
  }

  private hot(icon: string, action: Action, title: string, s: Settings, soon = false): HTMLElement {
    return h(
      'div.hot' + (soon ? '.soon' : ''),
      { title, onclick: () => this.onHotbar(action) },
      h('div.ring', {}, icon),
      h('span.key', {}, keyLabel(s.keys[action])),
    );
  }

  /** Party strip, top left: round portrait, level and HP bar per creature. */
  setParty(list: PartyEntry[]): void {
    if (list.length && !this.hasParty) {
      this.hasParty = true;
      if (this.lastSettings) this.applySettings(this.lastSettings);
    }
    if (!list.length) return;
    this.party.replaceChildren(
      ...list.map((m) => {
        const r = m.maxHp ? m.hp / m.maxHp : 0;
        return h(
          'div.party-mon' + (m.hp <= 0 ? '.fainted' : ''),
          { title: `${m.name} · Lv. ${m.level} · ${m.hp}/${m.maxHp} HP` },
          h('div.party-portrait', {}, m.portrait ? h('img', { src: m.portrait, alt: m.name }) : h('span', {}, m.name[0])),
          h(
            'div.party-info',
            {},
            h('div.party-lv', {}, `Lv. ${m.level}`, m.status ? h('span.status-chip.s-' + m.status, {}, STATUS_SHORT[m.status]) : m.hp <= 0 ? h('span.status-chip.s-fnt', {}, 'FNT') : null),
            h('div.party-hp', {}, h('i', { style: `width:${Math.round(r * 100)}%`, class: r > 0.5 ? '' : r > 0.2 ? 'mid' : 'low' })),
          ),
        );
      }),
    );
  }

  /** Fade the screen to black (or back); resolves once the fade has finished. */
  fade(on: boolean): Promise<void> {
    this.fadeEl.classList.toggle('show', on);
    return new Promise((r) => setTimeout(r, 450));
  }

  /** Trainer HP: the bar appears only while below full. */
  setTrainerHp(hp: number, max: number): void {
    const shown = Math.ceil(hp);
    const key = `${shown}/${max}`;
    if (key === this.lastHp) return;
    this.lastHp = key;
    const r = max ? Math.max(0, Math.min(1, hp / max)) : 0;
    this.vitals.classList.toggle('hurt', shown < max);
    this.hpFill.style.width = `${Math.round(r * 100)}%`;
    this.hpBar.classList.toggle('low', r <= 0.25);
    this.hpText.textContent = `${shown}/${max} HP`;
  }

  /** A hit landed on the trainer: red edge flash and a shake of the vitals panel. */
  hurt(): void {
    this.hurtFlash.classList.add('show');
    this.vitals.classList.remove('hit');
    void this.vitals.offsetWidth;
    this.vitals.classList.add('hit');
    setTimeout(() => this.hurtFlash.classList.remove('show'), 90);
  }

  /** Aiming a throw: hide the hotbar, hints, prompt and quests so the overlay has room. */
  setAiming(on: boolean): void {
    this.el.classList.toggle('aiming', on);
    if (!on) this.aim.hide();
  }

  /** Hide the overworld HUD pieces that would clutter a battle. */
  setBattleMode(on: boolean): void {
    this.el.classList.toggle('in-battle', on);
  }

  setQuests(q: Quest[]): void {
    this.questList = q;
    this.quests.replaceChildren(
      ...q.map((x) => h('div.quest' + (x.main ? '.main' : '') + (x.done ? '.done' : ''), {}, h('span.icon'), x.text)),
    );
  }

  setPrompt(text: string | null, key = 'E'): void {
    this.prompt.classList.toggle('show', !!text);
    if (text) this.prompt.replaceChildren(h('span.key', {}, key), text);
  }

  setNetStatus(text: string): void {
    this.net.textContent = text;
  }

  setPointerLocked(locked: boolean): void {
    this.clickToPlay.classList.toggle('hidden', locked);
  }

  showToast(title: string, sub = '', seconds = 4): void {
    this.toast.replaceChildren(title, sub ? h('small', {}, sub) : '');
    this.toast.classList.add('show');
    this.toastTimer = seconds;
  }

  update(
    dt: number,
    player: { x: number; z: number; yaw: number },
    camYaw: number,
    stamina: number,
    exhausted: boolean,
    landmarks: { x: number; z: number; label: string }[],
    partner: { x: number; z: number } | undefined,
    gameMinutes: number,
  ): void {
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps.textContent = `${Math.round(this.fpsFrames / this.fpsTime)} FPS`;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('show');
    }
    this.stamina.style.width = `${Math.round(stamina * 100)}%`;
    this.staminaBar.classList.toggle('exhausted', exhausted);

    const hh = Math.floor(gameMinutes / 60) % 24;
    const mm = Math.floor(gameMinutes % 60);
    this.clock.textContent = `${hh >= 6 && hh < 19 ? '☀' : '☾'} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

    // Compass: heading in degrees clockwise from north. North is +Z; Three.js is right-handed, so east is -X.
    const heading = deg(-camYaw);
    const width = this.compass.clientWidth || 520;
    const marks: HTMLElement[] = [h('div.compass-line'), h('div.compass-center')];
    const place = (bearing: number, el: HTMLElement) => {
      const off = wrap180(bearing - heading);
      if (Math.abs(off) > COMPASS_SPAN / 2) return;
      el.style.left = `${width / 2 + (off / COMPASS_SPAN) * width}px`;
      marks.push(el);
    };
    for (const [b, label, major] of DIRS) place(b, h('div.compass-mark' + (major ? '' : '.minor'), {}, label));
    const active = this.questList.find((q) => !q.done && q.target);
    if (active?.target) {
      place(deg(Math.atan2(player.x - active.target.x, active.target.z - player.z)), h('div.compass-mark.poi', {}, '◆'));
    }
    this.compass.replaceChildren(...marks);

    const markers = landmarks.map((l) => ({ x: l.x, z: l.z, color: '#ffffff' }));
    if (active?.target) markers.push({ x: active.target.x, z: active.target.z, color: '#ffd34d' });
    this.minimap.draw(player.x, player.z, player.yaw, camYaw, markers, partner);
  }
}

function deg(rad: number): number {
  return ((rad * 180) / Math.PI + 360) % 360;
}

function wrap180(d: number): number {
  return ((((d + 180) % 360) + 360) % 360) - 180;
}
