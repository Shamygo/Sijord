import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { answerFor, CARTOGRAPHER, cartographerState, hasTreasureMap, MAP_ERRORS, placeList, surveyAt, toCheck, toReport, TREASURE } from '../src/shared/cartographer';
import { ITEMS } from '../src/shared/items';
import { HALF, MESAS, ROADS, TOWN, WATER_LEVEL, distToPolyline } from '../src/client/world/layout';
import { terrainHeight } from '../src/client/world/terrain';
import { Cartographer, TreasureSpot } from '../src/client/npc/cartographer';
import type { World } from '../src/client/world/types';

describe('Edvin the cartographer', () => {
  it('has three wrong maps, each with exactly one true answer', () => {
    expect(MAP_ERRORS.length).toBe(3);
    expect(new Set(MAP_ERRORS.map((e) => e.id)).size).toBe(3);
    for (const e of MAP_ERRORS) {
      expect(e.options.length).toBeGreaterThanOrEqual(3);
      expect(new Set(e.options).size).toBe(e.options.length);
      expect(e.options[e.answer], e.id).toBeDefined();
      expect(Math.abs(e.x)).toBeLessThan(HALF);
      expect(Math.abs(e.z)).toBeLessThan(HALF);
      for (const line of [e.place, e.claim, e.ask, e.right]) expect(line.length).toBeGreaterThan(4);
    }
    // The true answers aren't all in the same slot.
    expect(new Set(MAP_ERRORS.map((e) => e.answer)).size).toBeGreaterThan(1);
  });

  it('stands, and buries his treasure, on dry open ground', () => {
    for (const p of [CARTOGRAPHER, TREASURE]) {
      expect(terrainHeight(p.x, p.z)).toBeGreaterThan(WATER_LEVEL + 1);
      for (const r of ROADS) expect(distToPolyline(p.x, p.z, r.pts)).toBeGreaterThan(8);
      for (const m of MESAS) expect(Math.hypot(p.x - m.x, p.z - m.z)).toBeGreaterThan(m.r + 10);
      expect(Math.hypot(p.x - TOWN.x, p.z - TOWN.z)).toBeGreaterThan(TOWN.blendR);
      expect(Math.abs(p.x)).toBeLessThan(HALF - 60);
      expect(Math.abs(p.z)).toBeLessThan(HALF - 60);
    }
    expect(ITEMS[TREASURE.tool]).toBeDefined();
    for (const id of Object.keys(TREASURE.items)) expect(ITEMS[id]).toBeDefined();
  });

  it('checks a page when you walk up to its place, only once you have his pages', () => {
    const arch = MAP_ERRORS.find((e) => e.id === 'arch')!;
    const st = cartographerState(undefined);
    expect(st).toEqual({ taken: false, seen: [], fixed: [], dug: false });
    expect(surveyAt(st, arch.x, arch.z)).toBeUndefined();
    st.taken = true;
    expect(surveyAt(st, arch.x + arch.r + 1, arch.z)).toBeUndefined();
    expect(surveyAt(st, arch.x + 2, arch.z - 2)).toBe(arch);
    st.seen.push('arch');
    expect(surveyAt(st, arch.x, arch.z)).toBeUndefined();
    expect(toReport(st)).toEqual([arch]);
    expect(toCheck(st).map((e) => e.id)).toEqual(['stones', 'jetty']);
    expect(placeList(MAP_ERRORS)).toBe('the Old Arch, the standing stones and the lake jetty');
    expect(placeList(toCheck(st))).toBe('the standing stones and the lake jetty');
    expect(placeList([arch])).toBe('the Old Arch');
  });

  it('sends you back to look again after a wrong answer, and gives the real map after three right ones', () => {
    const st = cartographerState({ taken: true, seen: ['arch', 'stones', 'jetty'] });
    const [arch, stones, jetty] = MAP_ERRORS;
    expect(answerFor(st, arch, (arch.answer + 1) % arch.options.length)).toBe(false);
    expect(st.seen).not.toContain('arch');
    expect(st.fixed).toEqual([]);
    expect(toCheck(st)).toEqual([arch]);
    expect(answerFor(st, stones, stones.answer)).toBe(true);
    expect(answerFor(st, jetty, jetty.answer)).toBe(true);
    expect(hasTreasureMap(st)).toBe(false);
    st.seen.push('arch');
    expect(answerFor(st, arch, arch.answer)).toBe(true);
    expect(hasTreasureMap(st)).toBe(true);
    expect(toCheck(st)).toEqual([]);
    expect(toReport(st)).toEqual([]);
  });

  it('loads whatever an old or hand-edited save has', () => {
    expect(cartographerState('x')).toEqual({ taken: false, seen: [], fixed: [], dug: false });
    expect(cartographerState({ taken: true, seen: ['arch', 'moon', 'arch', 3], fixed: ['stones', 'stones'] })).toEqual({ taken: true, seen: ['arch'], fixed: ['stones'], dug: false });
    // Seen and fixed at once: it's fixed.
    expect(cartographerState({ taken: true, seen: ['arch'], fixed: ['arch'] }).seen).toEqual([]);
    // Dug without the map can't be right.
    expect(cartographerState({ taken: true, fixed: ['arch'], dug: true }).dug).toBe(false);
    expect(cartographerState({ taken: true, fixed: ['arch', 'stones', 'jetty'], dug: true }).dug).toBe(true);
  });

  it('sets up his easel and the cairn over the chest', () => {
    const world = { heightAt: () => 3, colliders: [] } as unknown as World;
    const c = new Cartographer(world);
    const t = new TreasureSpot(world);
    // Edvin, his easel and the cairn.
    expect(world.colliders.length).toBe(3);
    expect(c.person.position.y).toBe(3);
    c.setFixed(['arch']);
    c.update(0.1, c.person.position.clone().add(new THREE.Vector3(3, 0, 0)));
    expect(c.person.visible).toBe(true);
    c.update(0.1, new THREE.Vector3(5000, 0, 0));
    expect(c.person.visible).toBe(false);
    t.update(0.1, t.position.clone());
    expect(t.root.visible).toBe(true);
    t.setDug(true);
    t.update(0.1, new THREE.Vector3(-5000, 0, 0));
    expect(t.root.visible).toBe(false);
  });
});
