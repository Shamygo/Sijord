import { COOK_GRADES, COOK_MAX, COOK_STEPS, judge, markerAt, sweetSpot } from '../../shared/cookoff';
import { h } from './dom';

/** Seconds the bar sits still before the marker starts, and the grade stays up after a press. */
const READY = 0.9;
const SHOW = 1.1;

/**
 * Gudrun's cook-off (DESIGN §12.4): three timed steps. A marker sweeps across a bar; stop it (E,
 * Space or a click) on the sweet spot. Time comes from the game loop (`update`), so the minigame
 * runs at the game's own speed.
 */
export class CookOffPanel {
  readonly el: HTMLDivElement;
  private title = h('div.cook-step');
  private bar = h('div.cook-bar');
  private ok = h('i.cook-zone.ok');
  private good = h('i.cook-zone.good');
  private perfect = h('i.cook-zone.perfect');
  private marker = h('b.cook-marker');
  private grade = h('div.cook-grade');
  private dots = COOK_STEPS.map(() => h('span.cook-dot'));
  private total = h('div.cook-total');
  private step = -1;
  private t = 0;
  private phase: 'ready' | 'run' | 'shown' | 'idle' = 'idle';
  private scores: number[] = [];
  private spot = 0.5;
  private seed = 0;
  private done: ((scores: number[]) => void) | null = null;

  constructor() {
    this.bar.append(this.ok, this.good, this.perfect, this.marker);
    this.el = h(
      'div.cookoff',
      { onclick: () => this.press() },
      h('div.cook-head', {}, h('span.cook-icon', {}, '🍲'), h('div', {}, h('b', {}, 'Cook-off'), h('small', {}, 'Stop the marker on the gold')), this.total),
      this.title,
      this.bar,
      h('div.cook-foot', {}, h('div.cook-dots', {}, ...this.dots), this.grade, h('small.cook-key', {}, 'E / Space / click')),
    );
  }

  get active(): boolean {
    return this.phase !== 'idle';
  }

  /** Run the three steps; resolves with each step's score (0-3). */
  play(seed: number): Promise<number[]> {
    this.seed = seed;
    this.scores = [];
    for (const d of this.dots) d.className = 'cook-dot';
    this.total.textContent = `0 / ${COOK_MAX}`;
    this.el.classList.add('show');
    this.begin(0);
    return new Promise((resolve) => (this.done = resolve));
  }

  private begin(i: number): void {
    this.step = i;
    const s = COOK_STEPS[i];
    this.spot = sweetSpot(this.seed, i);
    const zone = (el: HTMLElement, half: number) => {
      el.style.left = `${Math.max(0, this.spot - half) * 100}%`;
      el.style.width = `${(Math.min(1, this.spot + half) - Math.max(0, this.spot - half)) * 100}%`;
    };
    zone(this.ok, s.ok);
    zone(this.good, s.good);
    zone(this.perfect, s.perfect);
    this.title.textContent = `${i + 1} of ${COOK_STEPS.length} · ${s.label}`;
    this.grade.textContent = 'Ready…';
    this.grade.className = 'cook-grade';
    this.dots[i].classList.add('now');
    this.t = 0;
    this.phase = 'ready';
    this.place(0);
  }

  private place(x: number): void {
    this.marker.style.left = `${x * 100}%`;
  }

  /** Stop the marker (E, Space or a click). Ignored before it starts moving. */
  press(): void {
    if (this.phase !== 'run') return;
    const s = COOK_STEPS[this.step];
    const x = markerAt(s, this.t);
    const score = judge(s, x, this.spot);
    this.scores.push(score);
    this.place(x);
    this.grade.textContent = COOK_GRADES[score] + (score ? ` +${score}` : '');
    this.grade.className = `cook-grade g${score}`;
    this.dots[this.step].className = `cook-dot g${score}`;
    this.total.textContent = `${this.scores.reduce((a, b) => a + b, 0)} / ${COOK_MAX}`;
    this.phase = 'shown';
    this.t = 0;
  }

  update(dt: number): void {
    if (this.phase === 'idle') return;
    this.t += dt;
    if (this.phase === 'ready' && this.t >= READY) {
      this.phase = 'run';
      this.t = 0;
      this.grade.textContent = '';
    } else if (this.phase === 'run') {
      this.place(markerAt(COOK_STEPS[this.step], this.t));
    } else if (this.phase === 'shown' && this.t >= SHOW) {
      if (this.step + 1 < COOK_STEPS.length) this.begin(this.step + 1);
      else {
        this.phase = 'idle';
        this.el.classList.remove('show');
        const done = this.done;
        this.done = null;
        done?.(this.scores);
      }
    }
  }

  /** Dev only: where the marker and the sweet spot are now. */
  debugState(): { step: number; phase: string; marker: number; spot: number } {
    return { step: this.step, phase: this.phase, marker: this.phase === 'run' ? markerAt(COOK_STEPS[this.step], this.t) : -1, spot: this.spot };
  }
}
