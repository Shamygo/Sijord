import { describe, expect, it } from 'vitest';
import { DEFAULT_KEYS, keyLabel, rebind } from '../src/client/core/settings';

describe('settings', () => {
  it('swaps keys when rebinding onto a used key', () => {
    const k = rebind(DEFAULT_KEYS, 'map', 'KeyB');
    expect(k.map).toBe('KeyB');
    expect(k.bag).toBe('KeyM');
  });

  it('labels keys readably', () => {
    expect(keyLabel('KeyW')).toBe('W');
    expect(keyLabel('ShiftLeft')).toBe('Shift');
    expect(keyLabel('ArrowUp')).toBe('↑');
  });
});
