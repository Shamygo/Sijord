import type { GraphicsQuality } from './render';

/** Rebindable actions. Esc is reserved for the pause menu. */
export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'jump' | 'climb' | 'interact'
  | 'map' | 'bag' | 'party' | 'quests' | 'throw' | 'partner';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Move forward',
  back: 'Move back',
  left: 'Move left',
  right: 'Move right',
  sprint: 'Sprint',
  jump: 'Jump',
  climb: 'Climb',
  interact: 'Talk / interact',
  map: 'Open map',
  bag: 'Open bag',
  party: 'Open party',
  quests: 'Open quests',
  throw: 'Throw ball',
  partner: 'Call partner Pokemon',
};

export const DEFAULT_KEYS: Record<Action, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  climb: 'KeyC',
  interact: 'KeyE',
  map: 'KeyM',
  bag: 'KeyB',
  party: 'KeyP',
  quests: 'KeyJ',
  throw: 'KeyQ',
  partner: 'KeyF',
};

export interface Settings {
  keys: Record<Action, string>;
  /** Multiplier on the camera's base mouse sensitivity. */
  mouseSensitivity: number;
  invertY: boolean;
  fov: number;
  quality: GraphicsQuality;
  showFps: boolean;
  showControlsHint: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  keys: { ...DEFAULT_KEYS },
  mouseSensitivity: 1,
  invertY: false,
  fov: 60,
  quality: 'medium',
  showFps: false,
  showControlsHint: true,
};

const KEY = 'sijord.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...s, keys: { ...DEFAULT_KEYS, ...(s.keys ?? {}) } };
    }
  } catch {
    // fall through to defaults
  }
  return structuredClone(DEFAULT_SETTINGS);
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage unavailable; settings last for this session only.
  }
}

/** "KeyW" -> "W", "ShiftLeft" -> "Shift", "Space" -> "Space". */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[code] ?? code;
  const named: Record<string, string> = {
    ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'Alt', AltRight: 'R-Alt', Space: 'Space', Tab: 'Tab', Enter: 'Enter', Backquote: '`',
  };
  return named[code] ?? code;
}

/** Rebinding `action` to `code` swaps with whichever action already used that key. */
export function rebind(keys: Record<Action, string>, action: Action, code: string): Record<Action, string> {
  const next = { ...keys };
  const clash = (Object.keys(next) as Action[]).find((a) => next[a] === code && a !== action);
  if (clash) next[clash] = keys[action];
  next[action] = code;
  return next;
}
