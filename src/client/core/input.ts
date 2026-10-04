import type { MoveInput } from '../player/types';
import type { Action, Settings } from './settings';

/** Keyboard + mouse state. Mouse look only while the pointer is locked to the canvas. */
export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  /** When the pointer was last released; browsers refuse to re-lock for about a second after Esc. */
  private unlockedAt = 0;

  /**
   * `onInstant` receives menu-type actions the moment the key goes down, rather than on the next
   * frame, so menus open immediately even while a frame is slow (e.g. shaders compiling).
   */
  constructor(
    private canvas: HTMLCanvasElement,
    private settings: () => Settings,
    private onInstant: (a: Action | 'pause') => void,
  ) {
    addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Escape') {
        this.onInstant('pause');
        return;
      }
      const keys = this.settings().keys;
      const instant = INSTANT.find((a) => keys[a] === e.code);
      if (instant) {
        this.onInstant(instant);
        return;
      }
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += e.deltaY;
    }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.unlockedAt = performance.now();
    });
  }

  /** Capture the mouse. Retries once after the browser's post-Esc cooldown if it refuses. */
  requestLock(): void {
    const attempt = () => {
      try {
        const r = this.canvas.requestPointerLock() as unknown;
        if (r instanceof Promise) r.catch(() => {});
      } catch {
        // Not allowed right now; the "Click to play" overlay stays up.
      }
    };
    const wait = 1100 - (performance.now() - this.unlockedAt);
    if (wait > 0) setTimeout(attempt, wait);
    else attempt();
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** True once per press of the key bound to `action`. */
  consumeAction(action: Action): boolean {
    return this.pressed.delete(this.settings().keys[action]);
  }

  /** True once per press of a raw key code. */
  consume(code: string): boolean {
    return this.pressed.delete(code);
  }

  move(): MoveInput {
    const keys = this.settings().keys;
    const k = (a: Action) => (this.keys.has(keys[a]) ? 1 : 0);
    const raw = (c: string) => (this.keys.has(c) ? 1 : 0);
    return {
      forward: Math.max(-1, Math.min(1, k('forward') - k('back') + raw('ArrowUp') - raw('ArrowDown'))),
      right: Math.max(-1, Math.min(1, k('right') - k('left') + raw('ArrowRight') - raw('ArrowLeft'))),
      sprint: this.keys.has(keys.sprint),
      jump: this.pressed.has(keys.jump),
    };
  }

  /** Drop held keys, e.g. when a menu opens, so the player doesn't keep walking. */
  clearHeld(): void {
    this.keys.clear();
    this.pressed.clear();
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = this.wheel = 0;
  }
}

const INSTANT: Action[] = ['map', 'bag', 'party', 'quests', 'throw'];

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
}
