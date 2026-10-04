import type { Choice, Pos } from '../../shared/battle/engine';
import type { MajorStatus, MoveCategory, TypeName } from '../../shared/battle/types';
import { h } from '../ui/dom';
import { TYPE_COLORS } from './fx';

export interface PlateInfo {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  status?: MajorStatus;
  /** Show exact HP numbers (your own creatures). */
  mine: boolean;
  /** Trainer label under the name, e.g. "Wild" or "Sunniva". */
  tag?: string;
  /** Portrait image (your own creatures, docked bottom left). */
  portrait?: string;
}

export interface MoveOption {
  name: string;
  type: TypeName;
  category: MoveCategory;
  power: number;
  accuracy: number | true;
  pp: number;
  maxPp: number;
  description: string;
  /** Best effectiveness against the current foes (for the hint chip). */
  effect: number | null;
  /** Targets the player must pick from (empty: the move picks its own). */
  targets: { pos: Pos; label: string }[];
}

export interface MovePrompt {
  name: string;
  portrait?: string;
  moves: MoveOption[];
  bench: { index: number; label: string; hp: number; maxHp: number; portrait?: string }[];
  canRun: boolean;
  /** Can undo the previous slot's choice. */
  canBack: boolean;
}

export const STATUS_LABEL: Record<MajorStatus, string> = { brn: 'BRN', par: 'PAR', psn: 'PSN', tox: 'TOX', slp: 'SLP', frz: 'FRZ' };
const CAT_ICON: Record<MoveCategory, string> = { physical: '✊', special: '✦', status: '◌' };

/** Everything on screen during a battle except the 3D scene. */
export class BattleUi {
  readonly el = h('div.battle-ui');
  private plates = new Map<string, { el: HTMLElement; fill: HTMLElement; ghost: HTMLElement; hpText: HTMLElement; status: HTMLElement; img: HTMLImageElement; ratio: number }>();
  /** Your own creatures' plates sit together in the bottom-left corner, as in the art reference. */
  private dock = h('div.plate-dock');
  private captionEl = h('div.battle-caption');
  private panel = h('div.battle-panel');
  private numbers = h('div.battle-numbers');
  /** The last few lines of the battle, top right, so nothing is missed when it moves fast. */
  private logEl = h('div.battle-log');
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    this.el.append(this.numbers, this.logEl, this.dock, this.captionEl, this.panel);
  }

  show(): void {
    this.el.classList.add('show');
  }

  hide(): void {
    this.el.classList.remove('show');
    this.closePanel();
  }

  setPlate(k: string, info: PlateInfo): void {
    let p = this.plates.get(k);
    if (!p) {
      const fill = h('i');
      const ghost = h('b');
      const hpText = h('span.hp-text');
      const status = h('span.status-chip');
      const img = h('img.plate-portrait', { alt: '' });
      const el = h('div.plate', {}, img, h('div.plate-body', {}, h('div.plate-top', {}, h('span.plate-name'), status, h('span.plate-level')), h('div.plate-tag'), h('div.hpbar', {}, ghost, fill), hpText));
      p = { el, fill, ghost, hpText, status, img, ratio: info.maxHp ? info.hp / info.maxHp : 0 };
      this.plates.set(k, p);
    }
    p.el.classList.toggle('mine', info.mine);
    if (info.mine) {
      // Keep the dock in slot order.
      const after = Array.from(this.dock.children).find((c) => (c as HTMLElement).dataset.key! > k);
      p.el.dataset.key = k;
      if (p.el.parentElement !== this.dock) this.dock.insertBefore(p.el, after ?? null);
      p.el.style.transform = '';
      p.el.style.display = '';
    } else if (p.el.parentElement !== this.el) this.el.append(p.el);
    if (info.portrait) p.img.src = info.portrait;
    p.img.style.display = info.mine && info.portrait ? '' : 'none';
    (p.el.querySelector('.plate-name') as HTMLElement).textContent = info.name;
    (p.el.querySelector('.plate-level') as HTMLElement).textContent = `Lv. ${info.level}`;
    (p.el.querySelector('.plate-tag') as HTMLElement).textContent = info.tag ?? '';
    this.setHp(k, info.hp, info.maxHp, true);
    this.setStatus(k, info.status ?? null);
  }

  setHp(k: string, hp: number, maxHp: number, instant = false): void {
    const p = this.plates.get(k);
    if (!p) return;
    const r = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    p.fill.style.width = `${r * 100}%`;
    p.fill.className = r > 0.5 ? '' : r > 0.2 ? 'mid' : 'low';
    if (instant) p.ghost.style.width = `${r * 100}%`;
    else setTimeout(() => (p.ghost.style.width = `${r * 100}%`), 350);
    p.hpText.textContent = p.el.classList.contains('mine') ? `${hp} / ${maxHp}` : '';
    p.ratio = r;
  }

  setStatus(k: string, status: MajorStatus | null): void {
    const p = this.plates.get(k);
    if (!p) return;
    p.status.textContent = status ? STATUS_LABEL[status] : '';
    p.status.className = 'status-chip' + (status ? ` s-${status}` : '');
  }

  removePlate(k: string): void {
    this.plates.get(k)?.el.remove();
    this.plates.delete(k);
  }

  clearPlates(): void {
    for (const p of this.plates.values()) p.el.remove();
    this.plates.clear();
  }

  /** Screen position (CSS pixels) of a plate; hidden when off screen. */
  placePlate(k: string, x: number, y: number, visible: boolean): void {
    const p = this.plates.get(k);
    if (!p || p.el.classList.contains('mine')) return;
    p.el.style.display = visible ? '' : 'none';
    p.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  caption(text: string | null): void {
    this.captionEl.textContent = text ?? '';
    this.captionEl.classList.toggle('show', !!text);
    if (text) this.log(text);
  }

  /** Add a line to the battle log (also called for every caption). */
  log(text: string): void {
    if (this.logEl.lastElementChild?.textContent === text) return;
    this.logEl.append(h('div', {}, text));
    while (this.logEl.childElementCount > 6) this.logEl.firstElementChild!.remove();
  }

  popNumber(x: number, y: number, text: string, kind: 'damage' | 'heal' | 'crit' | 'super' | 'weak' | 'miss'): void {
    const el = h('div.pop.' + kind, {}, text);
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    this.numbers.append(el);
    setTimeout(() => el.remove(), 1300);
  }

  private closePanel(): void {
    this.panel.replaceChildren();
    this.panel.classList.remove('show');
    if (this.keyHandler) removeEventListener('keydown', this.keyHandler, true);
    this.keyHandler = null;
  }

  private onKeys(fn: (e: KeyboardEvent) => void): void {
    if (this.keyHandler) removeEventListener('keydown', this.keyHandler, true);
    this.keyHandler = (e) => {
      // Battle keys win over the game's own bindings while a menu is open.
      if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Escape', 'Backspace', 'KeyR', 'KeyS', 'Tab', 'KeyQ', 'KeyE', 'KeyB', 'KeyM', 'KeyP', 'KeyJ'].includes(e.code)) {
        e.preventDefault();
        e.stopPropagation();
      }
      fn(e);
    };
    addEventListener('keydown', this.keyHandler, true);
  }

  /** Ask what one creature should do. Resolves with its choice, or 'back' to redo the previous slot. */
  promptMove(p: MovePrompt): Promise<Choice | 'back'> {
    return new Promise((resolve) => {
      const done = (c: Choice | 'back') => {
        this.closePanel();
        resolve(c);
      };
      const main = () => {
        const moveButtons = p.moves.map((m, i) => {
          const disabled = m.pp <= 0;
          const eff = m.category === 'status' || m.effect === null ? null : m.effect >= 2 ? 'Super effective' : m.effect === 0 ? 'No effect' : m.effect < 1 ? 'Not very effective' : null;
          return h(
            'button.move-btn' + (disabled ? '.off' : ''),
            {
              style: `--type:${TYPE_COLORS[m.type]}`,
              disabled,
              title: `${m.description}\nPower ${m.power || '—'} · Accuracy ${m.accuracy === true ? '—' : m.accuracy}`,
              onclick: () => pick(i),
            },
            h('span.move-key', {}, String(i + 1)),
            h('span.move-name', {}, m.name),
            h('span.move-meta', {}, h('span.type-chip', { style: `background:${TYPE_COLORS[m.type]}` }, m.type), h('span.cat', {}, CAT_ICON[m.category]), `PP ${m.pp}/${m.maxPp}`),
            eff ? h('span.eff' + (m.effect! >= 2 ? '.up' : '.down'), {}, eff) : null,
          );
        });
        this.panel.replaceChildren(
          h('div.panel-head', {}, p.portrait ? h('img.panel-portrait', { src: p.portrait }) : null, h('span', {}, `What will ${p.name} do?`)),
          h('div.move-grid', {}, ...moveButtons),
          h(
            'div.panel-actions',
            {},
            h('button.act', { onclick: () => switchMenu(), disabled: !p.bench.length }, h('span.key', {}, 'S'), ' Switch'),
            p.canRun ? h('button.act', { onclick: () => done({ kind: 'run' }) }, h('span.key', {}, 'R'), ' Run') : null,
            p.canBack ? h('button.act.back', { onclick: () => done('back') }, h('span.key', {}, 'Esc'), ' Back') : null,
          ),
        );
        this.panel.classList.add('show');
        this.onKeys((e) => {
          const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
          if (n >= 0 && n < p.moves.length && p.moves[n].pp > 0) pick(n);
          else if (e.code === 'KeyS' && p.bench.length) switchMenu();
          else if (e.code === 'KeyR' && p.canRun) done({ kind: 'run' });
          else if ((e.code === 'Escape' || e.code === 'Backspace') && p.canBack) done('back');
        });
      };
      const pick = (i: number) => {
        const m = p.moves[i];
        if (m.targets.length <= 1) {
          done({ kind: 'move', move: i, target: m.targets[0]?.pos });
          return;
        }
        this.panel.replaceChildren(
          h('div.panel-head', {}, h('span', {}, `${m.name}: choose a target`)),
          h('div.target-grid', {}, ...m.targets.map((t, j) => h('button.target-btn' + (t.pos.side === 0 ? '.ally' : ''), { onclick: () => done({ kind: 'move', move: i, target: t.pos }) }, h('span.move-key', {}, String(j + 1)), t.label))),
          h('div.panel-actions', {}, h('button.act.back', { onclick: () => main() }, h('span.key', {}, 'Esc'), ' Back')),
        );
        this.onKeys((e) => {
          const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
          if (n >= 0 && n < m.targets.length) done({ kind: 'move', move: i, target: m.targets[n].pos });
          else if (e.code === 'Escape' || e.code === 'Backspace') main();
        });
      };
      const switchMenu = () => {
        this.panel.replaceChildren(
          h('div.panel-head', {}, h('span', {}, 'Switch to...')),
          h('div.target-grid', {}, ...p.bench.map((b, j) => this.benchButton(b, j, () => done({ kind: 'switch', team: b.index })))),
          h('div.panel-actions', {}, h('button.act.back', { onclick: () => main() }, h('span.key', {}, 'Esc'), ' Back')),
        );
        this.onKeys((e) => {
          const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
          if (n >= 0 && n < p.bench.length) done({ kind: 'switch', team: p.bench[n].index });
          else if (e.code === 'Escape' || e.code === 'Backspace') main();
        });
      };
      main();
    });
  }

  /** A creature fainted: pick who goes in next. */
  promptReplace(title: string, bench: MovePrompt['bench']): Promise<number> {
    return new Promise((resolve) => {
      const done = (i: number) => {
        this.closePanel();
        resolve(i);
      };
      this.panel.replaceChildren(
        h('div.panel-head', {}, h('span', {}, title)),
        h('div.target-grid', {}, ...bench.map((b, j) => this.benchButton(b, j, () => done(b.index)))),
      );
      this.panel.classList.add('show');
      this.onKeys((e) => {
        const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
        if (n >= 0 && n < bench.length) done(bench[n].index);
      });
    });
  }

  private benchButton(b: MovePrompt['bench'][number], j: number, onclick: () => void): HTMLElement {
    const r = b.maxHp ? b.hp / b.maxHp : 0;
    return h(
      'button.target-btn.bench',
      { onclick },
      h('span.move-key', {}, String(j + 1)),
      b.portrait ? h('img.bench-portrait', { src: b.portrait }) : null,
      h('span.bench-label', {}, b.label),
      h('span.bench-hp', {}, h('i', { style: `width:${r * 100}%`, class: r > 0.5 ? '' : r > 0.2 ? 'mid' : 'low' }), `${b.hp}/${b.maxHp}`),
    );
  }

  /** Wait for a click or key to continue (end-of-battle summaries). */
  waitForContinue(): Promise<void> {
    return new Promise<void>((resolve) => {
      const btn = h('button.act.continue', { onclick: () => finish() }, 'Continue ', h('span.key', {}, 'E'));
      const finish = () => {
        this.closePanel();
        resolve();
      };
      this.panel.replaceChildren(btn);
      this.panel.classList.add('show', 'slim');
      this.onKeys((e) => {
        if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') finish();
      });
    }).then(() => this.panel.classList.remove('slim'));
  }

  dispose(): void {
    this.closePanel();
    this.el.remove();
  }
}
