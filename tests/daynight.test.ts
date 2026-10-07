import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { clockAt, clockText, cycleFor, DAY_CYCLE_MS, isNight, msUntilSunrise, offsetFor, SUNRISE, SUNSET } from '../src/shared/daynight';
import { applyTimeOfDay, sunDirAt } from '../src/client/world/daynight';
import { SKY, SKY_UNIFORMS } from '../src/client/world/sky';
import { LampLight } from '../src/client/world/lamplight';

/** Minutes apart on a 24-hour dial. */
const apart = (a: number, b: number) => Math.min(Math.abs(a - b), 1440 - Math.abs(a - b));

describe('the shared clock', () => {
  it('runs a 30-minute day: 20 minutes of daylight, 10 of night', () => {
    expect(clockAt(0)).toBe(SUNRISE);
    expect(clockAt((DAY_CYCLE_MS * 2) / 3)).toBeCloseTo(SUNSET);
    expect(clockAt(DAY_CYCLE_MS)).toBe(SUNRISE);
    expect(clockAt(DAY_CYCLE_MS * 7 + 1000)).toBeCloseTo(clockAt(1000));
    // Midnight falls partway through the night.
    const midnight = cycleFor(0) * DAY_CYCLE_MS;
    expect(apart(clockAt(midnight), 0)).toBeLessThan(1e-6);
    // Daylight minutes pass slower than night ones.
    expect(clockAt(60_000) - clockAt(0)).toBeCloseTo(39);
    expect(apart(clockAt(midnight + 60_000), clockAt(midnight))).toBeCloseTo(66);
    for (let m = 0; m < 1440; m += 37) expect(apart(clockAt(cycleFor(m) * DAY_CYCLE_MS), m)).toBeLessThan(1e-6);
  });

  it('is the same for both friends, whenever each of them loaded the page', () => {
    const now = 1_791_400_000_000;
    expect(clockAt(now)).toBe(clockAt(now));
    // Two machines a couple of seconds apart see times a couple of game minutes apart at most.
    expect(Math.abs(clockAt(now + 2000) - clockAt(now))).toBeLessThan(3);
  });

  it('can be shifted to any time of day for testing', () => {
    const now = 1_791_400_123_456;
    for (const m of [0, 330, 360, 720, 1150, 1260]) expect(apart(clockAt(now + offsetFor(m, now)), m)).toBeLessThan(1e-3);
    expect(offsetFor(720, now)).toBeGreaterThanOrEqual(0);
    expect(offsetFor(720, now)).toBeLessThan(DAY_CYCLE_MS);
  });

  it('says when it is night, and prints the time', () => {
    expect(isNight(12 * 60)).toBe(false);
    expect(isNight(19 * 60 + 10)).toBe(false);
    expect(isNight(21 * 60)).toBe(true);
    expect(isNight(2 * 60)).toBe(true);
    expect(isNight(5 * 60 + 50)).toBe(false);
    expect(clockText(7 * 60 + 5.9)).toBe('07:05');
    expect(clockText(1440 + 61)).toBe('01:01');
    expect(msUntilSunrise(DAY_CYCLE_MS / 2)).toBe(DAY_CYCLE_MS / 2);
  });
});

describe('the sky through the day', () => {
  const sun = new THREE.DirectionalLight();
  const hemi = new THREE.HemisphereLight();

  it('keeps the daytime look the vale always had', () => {
    const st = applyTimeOfDay(12 * 60, sun, hemi);
    expect(st.exposure).toBe(1);
    expect(st.night).toBe(0);
    expect(st.moon).toBe(false);
    expect(sun.intensity).toBeCloseTo(2.6);
    expect(hemi.intensity).toBeCloseTo(1.2);
    expect(SKY_UNIFORMS.uZenith.value.getHex()).toBe(0x538fae);
    expect(SKY_UNIFORMS.uStars.value).toBe(0);
    // Noon sun: high in the southern sky.
    expect(SKY.sunDir.y).toBeGreaterThan(0.6);
    expect(SKY.sunDir.z).toBeLessThan(0);
  });

  it('turns to a moonlit night that stays readable', () => {
    const st = applyTimeOfDay(23 * 60, sun, hemi);
    expect(st.moon).toBe(true);
    expect(st.night).toBe(1);
    expect(SKY_UNIFORMS.uStars.value).toBe(1);
    expect(sun.intensity).toBeGreaterThan(0.3);
    expect(sun.intensity).toBeLessThan(1);
    expect(st.exposure).toBeGreaterThan(1.3);
    // Blue light, not grey or black.
    expect(sun.color.b).toBeGreaterThan(sun.color.r);
    expect(st.fog.b).toBeGreaterThan(st.fog.r);
  });

  it('moves the sun from east to west and changes the light without jumps', () => {
    expect(sunDirAt(SUNRISE + 30).x).toBeLessThan(0);
    expect(sunDirAt(SUNSET - 30).x).toBeGreaterThan(0);
    let last: { i: number; hemi: number; exp: number; zen: THREE.Color } | null = null;
    for (let m = 0; m <= 1440; m += 1) {
      const st = applyTimeOfDay(m, sun, hemi);
      const now = { i: sun.intensity, hemi: hemi.intensity, exp: st.exposure, zen: SKY_UNIFORMS.uZenith.value.clone() };
      if (last) {
        expect(Math.abs(now.i - last.i), `key light at ${clockText(m)}`).toBeLessThan(0.12);
        expect(Math.abs(now.hemi - last.hemi)).toBeLessThan(0.03);
        expect(Math.abs(now.exp - last.exp)).toBeLessThan(0.03);
        expect(Math.abs(now.zen.r - last.zen.r) + Math.abs(now.zen.g - last.zen.g) + Math.abs(now.zen.b - last.zen.b)).toBeLessThan(0.03);
      }
      last = now;
    }
  });
});

describe('lamplight after dark', () => {
  const lamps = [0, 6, 12, 18, 40].map((x) => ({ p: new THREE.Vector3(x, 2, 0) }));

  it('stays dark by day and lights the nearest lamps at night', () => {
    const l = new LampLight(lamps, 3);
    const lights = l.group.children as THREE.PointLight[];
    expect(lights.length).toBe(3);
    l.setNight(0);
    l.update(new THREE.Vector3(0, 0, 0), 0);
    for (const p of lights) expect(p.intensity).toBe(0);
    l.setNight(1);
    l.update(new THREE.Vector3(1, 0, 0), 0);
    expect(lights.map((p) => p.position.x).sort((a, b) => a - b)).toEqual([0, 6, 12]);
    expect(lights.find((p) => p.position.x === 0)!.intensity).toBeGreaterThan(5);
  });

  it('fades a lamp out before its light moves to another, so nothing pops', () => {
    const l = new LampLight(lamps, 3);
    const lights = l.group.children as THREE.PointLight[];
    l.setNight(1);
    // The third and fourth nearest lamps are as far away, so neither is lit.
    l.update(new THREE.Vector3(9, 0, 0), 0);
    const at = (x: number) => lights.find((p) => p.position.x === x)?.intensity ?? 0;
    expect(at(6)).toBeGreaterThan(5);
    expect(at(12)).toBeGreaterThan(5);
    expect(at(0) + at(18)).toBeLessThan(0.01);
    // Far from every lamp: all dark.
    l.update(new THREE.Vector3(300, 0, 0), 0);
    for (const p of lights) expect(p.intensity).toBe(0);
  });
});
