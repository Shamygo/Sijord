import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TREAT, WildManager, type WildCreature } from '../src/client/overworld/wild';
import type { World } from '../src/client/world/types';
import { isUnaware } from '../src/shared/overworld-catch';

function fakeWorld(): World {
  return {
    root: new THREE.Object3D(),
    heightAt: () => 0,
    waterLevel: -10,
    colliders: [],
    regions: [],
    anchors: { playerSpawns: [new THREE.Vector3(), new THREE.Vector3()], playerSpawnYaw: [0, 0], professor: new THREE.Vector3(), professorYaw: 0, landmarks: [] },
    halfSize: 500,
    sun: new THREE.DirectionalLight(),
    update: () => {},
    groundColorAt: () => new THREE.Color(),
  };
}

/** A manager with one herd at (150, 20) and the trainer far enough away not to bother it (no other herds spawn). */
function setup() {
  const w = new WildManager(fakeWorld(), 7, 7, { clock: () => 0, modelReady: () => false });
  const herd = w.spawnHerd(150, 20, 'hjordpup', 5);
  return { w, herd: herd.members };
}
const far = new THREE.Vector3(150, 0, 80);
const step = (w: WildManager, seconds: number, player = far) => {
  for (let t = 0; t < seconds; t += 0.1) w.update(0.1, player, 0, false, false);
};
const at = (m: WildCreature, dx = 0, dz = 0) => ({ x: m.mover.pos.x + dx, y: 0, z: m.mover.pos.z + dz });

describe('Treats', () => {
  it('a Treat that hits a calm Pokemon keeps it busy eating, then it settles and the Treat is gone', () => {
    const { w, herd } = setup();
    const m = herd[0];
    expect(w.treat(at(m), m)).toEqual({ eater: m, calmed: false });
    expect(m.state).toBe('eat');
    expect(w.treats.length).toBe(1);
    step(w, TREAT.eat - 1);
    expect(m.state).toBe('eat');
    step(w, 3);
    expect(m.state).not.toBe('eat');
    expect(w.treats.length).toBe(0);
    expect(m.calm).toBeGreaterThan(TREAT.calm - 5);
  });

  it('a furious Pokemon nearby goes for it before a calmer, closer one, and stays wary', () => {
    const { w, herd } = setup();
    const [angry, calm] = herd;
    w.breakOut(angry, 'charge');
    expect(angry.state).toBe('attack');
    // Lands right next to the calm one, a few metres from the angry one.
    const spot = at(calm, 0.3, 0);
    expect(Math.hypot(spot.x - angry.mover.pos.x, spot.z - angry.mover.pos.z)).toBeLessThan(TREAT.lure);
    expect(w.treat(spot, null)).toEqual({ eater: angry, calmed: true });
    expect(angry.state).toBe('eat');
    expect(angry.attack).toBeUndefined();
    expect(angry.alert).toBeGreaterThan(0);
    const unaware = (m: WildCreature) => isUnaware({ state: m.state, alert: m.alert, x: m.mover.pos.x, z: m.mover.pos.z, yaw: m.mover.yaw, px: m.mover.pos.x, pz: m.mover.pos.z + 3 });
    expect(unaware(angry)).toBe(false);
  });

  it('one that hits a charging Pokemon calms it on the spot', () => {
    const { w, herd } = setup();
    const m = herd[0];
    w.breakOut(m, 'charge');
    expect(w.treat(at(m), m)).toEqual({ eater: m, calmed: true });
    expect(m.state).toBe('eat');
  });

  it('one that lands out of reach waits for a Pokemon to wander close, and is lost after a while', () => {
    const { w, herd } = setup();
    const m = herd[0];
    expect(w.treat(at(m, TREAT.lure + 6, 0), null).eater).toBeNull();
    expect(w.treats.length).toBe(1);
    // Walk it over to the Treat by hand: it notices.
    m.mover.place(m.mover.pos.x + TREAT.lure + 3, m.mover.pos.z, fakeWorld(), 0);
    m.state = 'graze';
    step(w, 0.2);
    expect(m.state).toBe('eat');

    const { w: w2, herd: h2 } = setup();
    w2.treat(at(h2[0], 60, 0), null);
    step(w2, TREAT.life + 1);
    expect(w2.treats.length).toBe(0);
  });

  it('pulled into a battle mid-meal, the Pokemon leaves the Treat to a herd-mate', () => {
    const { w, herd } = setup();
    const [a, b] = herd;
    w.treat(at(a), a);
    w.enterBattle([a]);
    step(w, 0.2);
    expect(b.state).toBe('eat');
    expect(b.food).toBe(w.treats[0]);
  });

  it('eating counts as unaware from any side, unless it is still alert', () => {
    const base = { state: 'eat', x: 0, z: 0, yaw: 0, px: 0, pz: 3 };
    expect(isUnaware({ ...base, alert: 0 })).toBe(true);
    expect(isUnaware({ ...base, alert: 5 })).toBe(false);
    expect(isUnaware({ ...base, state: 'graze', alert: 0 })).toBe(false);
  });
});
