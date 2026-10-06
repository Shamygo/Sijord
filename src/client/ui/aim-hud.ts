import { assetUrl } from '../assets/loader';
import { ITEMS } from '../../shared/items';
import { h } from './dom';

/** What the aiming overlay shows this frame. */
export interface AimView {
  /** The selected ball and how many are left. */
  ball: string;
  count: number;
  /** Every ball kind carried, in cycle order (for the neighbours either side). */
  balls: string[];
  /** The creature the arc would hit, if any. */
  target?: {
    name: string;
    level: number;
    hp: number;
    maxHp: number;
    /** It hasn't noticed you: the throw is worth more. */
    unaware: boolean;
    /** Screen position of its middle and its on-screen radius in CSS pixels. */
    x: number;
    y: number;
    radius: number;
    visible: boolean;
  };
  /** The crosshair is on a creature. */
  onTarget: boolean;
  /** Key labels for the hints. */
  throwKey: string;
  cancelKey: string;
}

function ballIcon(id: string, cls = ''): HTMLElement {
  const item = ITEMS[id];
  return item?.sprite ? h('img.aim-ball-icon' + cls, { src: assetUrl(`items/${item.sprite}.png`), alt: item.name }) : h('span.aim-ball-icon' + cls, {}, item?.icon ?? '◓');
}

/**
 * The overworld throw overlay, after the catching reference (docs/reference/2026-10-05/ui-catching.png):
 * the selected ball with its count and neighbours at the bottom, Throw / Cancel hints, a lock
 * ring around the creature the arc will hit and its name, level and HP top right.
 */
export class AimHud {
  readonly el = h('div.aim-hud');
  private lock = h('div.aim-lock', {}, h('i.l'), h('i.r'));
  private reticle = h('div.aim-reticle', {}, h('i'));
  private panel = h('div.aim-target');
  private picker = h('div.aim-picker');
  private hints = h('div.aim-hints');
  private lastKey = '';
  private lastTarget = '';

  constructor() {
    this.el.append(this.reticle, this.lock, this.panel, this.picker, this.hints);
  }

  show(v: AimView): void {
    this.el.classList.add('show');
    const key = `${v.ball}|${v.count}|${v.balls.join(',')}|${v.throwKey}|${v.cancelKey}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      const i = Math.max(0, v.balls.indexOf(v.ball));
      const prev = v.balls.length > 1 ? v.balls[(i - 1 + v.balls.length) % v.balls.length] : null;
      const next = v.balls.length > 2 ? v.balls[(i + 1) % v.balls.length] : null;
      this.picker.replaceChildren(
        h('div.aim-ball-name', {}, ITEMS[v.ball]?.name ?? v.ball),
        h(
          'div.aim-ball-row',
          {},
          v.balls.length > 1 ? h('span.key', {}, 'Wheel') : null,
          prev ? h('div.aim-ball.side', {}, ballIcon(prev)) : null,
          h('div.aim-ball.main' + (v.count ? '' : '.empty'), {}, ballIcon(v.ball), h('b', {}, String(v.count))),
          next ? h('div.aim-ball.side', {}, ballIcon(next)) : null,
        ),
      );
      this.hints.replaceChildren(
        h('div', {}, h('span.key', {}, v.throwKey), ' Release to throw'),
        h('div', {}, h('span.key', {}, v.cancelKey), ' Cancel'),
      );
    }
    const t = v.target;
    this.reticle.classList.toggle('on', v.onTarget);
    this.lock.classList.toggle('show', !!t?.visible);
    this.panel.classList.toggle('show', !!t);
    if (t) {
      const r = Math.max(26, Math.min(220, t.radius));
      this.lock.style.transform = `translate(${t.x - r}px, ${t.y - r}px)`;
      this.lock.style.width = this.lock.style.height = `${r * 2}px`;
      this.lock.classList.toggle('unaware', t.unaware);
      const tk = `${t.name}|${t.level}|${t.hp}|${t.maxHp}|${t.unaware}`;
      if (tk !== this.lastTarget) {
        this.lastTarget = tk;
        const ratio = t.maxHp ? t.hp / t.maxHp : 0;
        this.panel.replaceChildren(
          h('div.aim-target-head', {}, h('b', {}, t.name), h('span', {}, `Lv. ${t.level}`)),
          h('div.aim-target-hp', {}, h('i', { style: `width:${Math.round(ratio * 100)}%`, class: ratio > 0.5 ? '' : ratio > 0.2 ? 'mid' : 'low' })),
          h('div.aim-target-state' + (t.unaware ? '.unaware' : ''), {}, t.unaware ? 'Hasn’t noticed you' : 'Wary of you'),
        );
      }
    } else this.lastTarget = '';
  }

  hide(): void {
    this.el.classList.remove('show');
    this.lock.classList.remove('show');
    this.panel.classList.remove('show');
  }
}
