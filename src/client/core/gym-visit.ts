import { chamberAt, gymState, newlySolved, sectionAt, unsafeAt, type Chamber, type GymInterior, type GymProgress, type GymState } from '../../shared/gym-interior';
import type { GymDef } from '../../shared/gyms';

type P = { x: number; z: number };

export type GymEvent =
  | { kind: 'fell'; chamber: Chamber }
  | { kind: 'solved'; index: number };

/**
 * One visit to a gym's interior: works out from where everyone stands which gates are open,
 * sends a player who steps onto an unsafe floor back to the chamber's start, and marks chambers
 * solved when two trainers reach the goal. Also steers the Echo, the spirit partner for players
 * with no friend online: it holds a chamber's first plate until the player reaches the second,
 * then crosses to the goal.
 */
export class GymVisit {
  readonly gym: GymDef;
  state: GymState;
  /** The Echo's spot (local), when it is with you. */
  echo: P | null = null;
  private echoTarget: P | null = null;

  constructor(readonly it: GymInterior, readonly progress: GymProgress, readonly withEcho: boolean) {
    this.gym = it.gym;
    this.state = gymState(it, [], progress);
    if (withEcho) this.echo = { x: it.spawn.x + 1.5, z: it.spawn.z - 1 };
  }

  local(world: P): P {
    return { x: world.x - this.it.ox, z: world.z - this.it.oz };
  }

  /** Advance one frame. `me` and `friends` are world positions (friends inside this gym only). */
  update(dt: number, me: P, friends: P[], solvedByFriends: number[], trainersByFriends: boolean): GymEvent[] {
    const events: GymEvent[] = [];
    // A friend's solved chambers count as ours: you were there together.
    for (const i of solvedByFriends) {
      if (!this.progress.solved.includes(i)) {
        this.progress.solved.push(i);
        events.push({ kind: 'solved', index: i });
      }
    }
    if (trainersByFriends) this.progress.trainers = true;
    const l = this.local(me);
    const others = friends.map((f) => this.local(f));
    if (this.withEcho && !others.length) this.steerEcho(dt, l);
    const people = [l, ...others, ...(this.echo && !others.length ? [this.echo] : [])];
    this.state = gymState(this.it, people, this.progress);
    const fell = unsafeAt(this.it, this.state, this.progress, l.x, l.z);
    if (fell) events.push({ kind: 'fell', chamber: fell });
    for (const i of newlySolved(this.it, people, this.progress)) {
      this.progress.solved.push(i);
      events.push({ kind: 'solved', index: i });
    }
    if (events.some((e) => e.kind === 'solved')) this.state = gymState(this.it, people, this.progress);
    return events;
  }

  /** Who is in the gym's hall or arena with you (for the boss presence rule). */
  together(me: P, friends: P[], where: 'hall' | 'arena'): boolean {
    if (!friends.length) return this.withEcho;
    const l = this.local(me);
    return sectionAt(this.it, l.z) === where && friends.some((f) => sectionAt(this.it, this.local(f).z) === where);
  }

  private steerEcho(dt: number, l: P): void {
    const c = chamberAt(this.it, l.z);
    if (c && !this.progress.solved.includes(c.index)) {
      const [first, second] = c.plates;
      const atSecond = Math.hypot(l.x - second.x, l.z - second.z) <= second.r;
      if (atSecond || (this.echoTarget && this.echoTarget.z >= c.goal.z0)) {
        // You've made it across: the Echo slips over to the goal.
        this.echoTarget = { x: second.x > 0 ? -4 : 4, z: (c.goal.z0 + c.goal.z1) / 2 };
        if (this.echo && this.echo.z < c.goal.z0) this.echo = { ...this.echoTarget };
      } else {
        this.echoTarget = { x: first.x, z: first.z };
        // Spirits don't walk round gates: it appears on the plate.
        if (this.echo && (Math.abs(this.echo.z - first.z) > 2.5 || Math.abs(this.echo.x - first.x) > 2.5)) this.echo = { ...this.echoTarget };
      }
    } else {
      // Otherwise it drifts along a step behind you.
      this.echoTarget = { x: l.x + 1.6, z: l.z - 1.6 };
    }
    if (!this.echo) this.echo = { ...this.echoTarget };
    const dx = this.echoTarget.x - this.echo.x;
    const dz = this.echoTarget.z - this.echo.z;
    const d = Math.hypot(dx, dz);
    if (d > 12) this.echo = { ...this.echoTarget };
    else if (d > 0.05) {
      const k = Math.min(1, (6 * dt) / d);
      this.echo = { x: this.echo.x + dx * k, z: this.echo.z + dz * k };
    }
  }
}
