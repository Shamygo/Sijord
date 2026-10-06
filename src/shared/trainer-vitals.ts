/**
 * The trainer's own health (DESIGN §5.4), kept small for now: a charging wild creature knocks
 * the trainer down and costs HP; at 0 HP they black out. HP comes back slowly once nothing has
 * hit them for a while, or straight away with a Potion from the bag.
 */
export const TRAINER_HP = {
  base: 100,
  perLevel: 2,
  /** Seconds without being hit before HP starts coming back. */
  regenDelay: 12,
  /** HP per second once regenerating: a full refill takes minutes, not seconds. */
  regenRate: 0.5,
  /** Total knockdown: the fall, lying there, getting up. */
  knockdown: 1.9,
  /** After a hit nothing else can land for this long (the knockdown plus a moment to react). */
  guard: 2.8,
  /** What a Potion does for a trainer. */
  potionHeal: 30,
  /** A charge (tackle lunge) is a strong physical move; nothing hits for less than this. */
  chargePower: 80,
  minDamage: 8,
};

/** How far a knocked-down trainer tips over (radians backwards), at knockdownTilt 1. */
export const KNOCKDOWN_ANGLE = 1.38;

/** Max HP: 100 plus 2 per trainer level, scaled by the class lean (the Tamer is frailer). */
export function trainerMaxHp(level = 1, classMod = 1): number {
  return Math.max(1, Math.round((TRAINER_HP.base + TRAINER_HP.perLevel * Math.max(0, level - 1)) * classMod));
}

/** DESIGN §5.4: level x power/40, softened by armour defence (none yet). */
export function chargeDamage(level: number, power = TRAINER_HP.chargePower, defence = 0): number {
  return Math.max(TRAINER_HP.minDamage, Math.round(((level * power) / 40) * (100 / (100 + Math.max(0, defence)))));
}

/**
 * Knockdown pose over time: 0 standing, 1 flat on the ground. Falls fast, lies still, then
 * gets up. `t` is seconds since the hit.
 */
export function knockdownTilt(t: number): number {
  const K = TRAINER_HP.knockdown;
  const fall = 0.3;
  const up = 0.7;
  if (t <= 0 || t >= K) return 0;
  if (t < fall) {
    const k = t / fall;
    return k * k;
  }
  if (t < K - up) return 1;
  const k = (t - (K - up)) / up;
  return 1 - k * k * (3 - 2 * k);
}

export type HitResult = 'ignored' | 'down' | 'out';

export class TrainerVitals {
  hp: number;
  /** Seconds since the last hit. */
  sinceHit = Infinity;
  /** Seconds left of the knockdown. */
  down = 0;
  /** Seconds left before another hit can land. */
  guard = 0;

  constructor(public max: number, hp = max) {
    this.hp = Math.max(0, Math.min(max, hp));
  }

  get full(): boolean {
    return this.hp >= this.max;
  }

  get knockedDown(): boolean {
    return this.down > 0;
  }

  /** Seconds into the current knockdown (for the pose). */
  get downTime(): number {
    return this.down > 0 ? TRAINER_HP.knockdown - this.down : 0;
  }

  /** Take a hit: knocked down, or out at 0 HP. Ignored while still recovering from the last one. */
  hit(damage: number): HitResult {
    if (this.guard > 0 || this.hp <= 0) return 'ignored';
    this.hp = Math.max(0, this.hp - Math.max(0, damage));
    this.sinceHit = 0;
    this.down = TRAINER_HP.knockdown;
    this.guard = TRAINER_HP.guard;
    return this.hp <= 0 ? 'out' : 'down';
  }

  /** Restore HP; returns how much was actually healed. */
  heal(amount: number): number {
    const before = this.hp;
    this.hp = Math.min(this.max, this.hp + Math.max(0, amount));
    return this.hp - before;
  }

  /** Change max HP (class or level), keeping current HP within it. */
  setMax(max: number): void {
    this.max = Math.max(1, max);
    this.hp = Math.min(this.hp, this.max);
  }

  /** Back to full (blackout recovery). */
  restore(): void {
    this.hp = this.max;
    this.down = this.guard = 0;
    this.sinceHit = Infinity;
  }

  /** `threatened`: something is attacking nearby or a battle is on, so no regeneration. */
  update(dt: number, threatened: boolean): void {
    this.down = Math.max(0, this.down - dt);
    this.guard = Math.max(0, this.guard - dt);
    this.sinceHit += dt;
    if (threatened) this.sinceHit = Math.min(this.sinceHit, 0);
    if (this.hp > 0 && this.sinceHit >= TRAINER_HP.regenDelay) this.hp = Math.min(this.max, this.hp + TRAINER_HP.regenRate * dt);
  }
}
