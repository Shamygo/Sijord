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
  private lockRequest = 0;
  private captureRequest = 0;
  /** Aiming a throw: the throw key and/or the right mouse button are held. */
  private aimKey = false;
  private aimMouse = false;
  private aimPress = false;
  private aimRelease = false;
  private click = false;

  /**
   * `onInstant` receives menu-type actions the moment the key goes down, rather than on the next
   * frame, so menus open immediately even while a frame is slow (e.g. shaders compiling).
   */
  constructor(
    private canvas: HTMLCanvasElement,
    private settings: () => Settings,
    private onInstant: (a: Action | 'pause') => void,
    private canCapture: () => boolean = () => true,
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
      if (e.code === keys.throw) {
        this.aimKey = true;
        this.aimPress = true;
      }
      const instant = INSTANT.find((a) => keys[a] === e.code);
      if (instant) {
        this.onInstant(instant);
        return;
      }
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === this.settings().keys.throw && this.aimKey) {
        this.aimKey = false;
        if (!this.aimMouse) this.aimRelease = true;
      }
    });
    addEventListener('blur', () => {
      this.keys.clear();
      // Losing focus mid-aim cancels the throw rather than firing it.
      this.aimKey = this.aimMouse = this.aimRelease = false;
    });
    // Right mouse aims (hold), left mouse throws while aiming. Only while playing (mouse captured).
    addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 2) {
        this.aimMouse = true;
        this.aimPress = true;
      } else if (e.button === 0) this.click = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button !== 2 || !this.aimMouse) return;
      this.aimMouse = false;
      if (!this.aimKey) this.aimRelease = true;
    });
    addEventListener('contextmenu', (e) => {
      if (e.target === this.canvas || this.locked) e.preventDefault();
    });
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
      // A browser can grant an in-flight request after a menu has already opened.
      if(this.locked && (this.captureRequest !== this.lockRequest || !this.canCapture())){this.lockRequest++;this.locked=false;document.exitPointerLock();}
      if (!this.locked) this.unlockedAt = performance.now();
    });
  }

  /** Capture the mouse. Retries once after the browser's post-Esc cooldown if it refuses. */
  requestLock(): void {
    const request = ++this.lockRequest;
    const attempt = () => {
      if (request !== this.lockRequest || !this.canCapture()) return;
      this.captureRequest=request;
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
    this.lockRequest++;
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
      climb: this.keys.has(keys.climb),
    };
  }

  /** The throw key or right mouse button is held (aiming a ball). */
  get aimHeld(): boolean {
    return this.aimKey || this.aimMouse;
  }

  /** True once when aiming starts (throw key or right mouse pressed). */
  consumeAimPress(): boolean {
    const v = this.aimPress;
    this.aimPress = false;
    return v;
  }

  /** True once when the aim was let go normally (release to throw). */
  consumeAimRelease(): boolean {
    const v = this.aimRelease;
    this.aimRelease = false;
    return v;
  }

  /** True once per left click while the mouse is captured. */
  consumeClick(): boolean {
    const v = this.click;
    this.click = false;
    return v;
  }

  /** Drop held keys, e.g. when a menu opens, so the player doesn't keep walking. */
  clearHeld(): void {
    this.keys.clear();
    this.pressed.clear();
    this.aimKey = this.aimMouse = this.aimPress = this.aimRelease = this.click = false;
  }

  /** Call at the end of each frame. */
  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = this.wheel = 0;
    this.aimPress = this.aimRelease = this.click = false;
  }
}

const INSTANT: Action[] = ['map', 'bag', 'party', 'quests', 'throw', 'partner'];

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
}
