import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SPECIES } from '../src/shared/data/species';
import { ITEMS } from '../src/shared/items';
import { creditDefeats, goalMet, questLogText, SIDE_QUESTS, sideQuestById, sideQuestState } from '../src/shared/sidequests';
import { ZONES } from '../src/client/overworld/wild';
import { Villager } from '../src/client/npc/villager';
import type { World } from '../src/client/world/types';

const byId = (id: string) => sideQuestById(id)!;

describe('side quests', () => {
  it('ask for things that exist and can be found in Hearthmeadow, and pay in things that exist', () => {
    expect(new Set(SIDE_QUESTS.map((q) => q.id)).size).toBe(SIDE_QUESTS.length);
    expect(new Set(SIDE_QUESTS.map((q) => q.giver)).size).toBe(SIDE_QUESTS.length);
    const wild = new Set(ZONES.flatMap((z) => z.entries.map((e) => e.species)));
    for (const q of SIDE_QUESTS) {
      const g = q.goal;
      if (g.kind === 'bring') for (const id of Object.keys(g.items)) expect(ITEMS[id], `${q.id} ${id}`).toBeDefined();
      if (g.kind === 'show') for (const s of g.species) expect(wild.has(s) && !!SPECIES[s], `${q.id} ${s}`).toBe(true);
      if (g.kind === 'defeat') expect(wild.has(g.species), q.id).toBe(true);
      for (const id of Object.keys(q.reward.items ?? {})) expect(ITEMS[id], `${q.id} reward ${id}`).toBeDefined();
      expect(q.reward.xp).toBeGreaterThan(0);
      for (const line of [...q.intro, q.ask, q.accepted, q.waiting, ...q.done, q.after, q.log, q.title]) expect(line.length).toBeGreaterThan(4);
    }
    expect(sideQuestById('constructor')).toBeUndefined();
    expect(sideQuestById(3)).toBeUndefined();
  });

  it('know when you can hand them in', () => {
    const bodil = byId('bodil-supper'), kari = byId('kari-pond'), arne = byId('arne-rattata');
    const empty = { bag: {}, party: [] };
    expect(goalMet(bodil, { state: 'active' }, empty)).toBe(false);
    expect(goalMet(bodil, { state: 'active' }, { bag: { 'wild-mushroom': 4, 'bramble-berry': 3 }, party: [] })).toBe(false);
    expect(goalMet(bodil, { state: 'active' }, { bag: { 'wild-mushroom': 5, 'bramble-berry': 4 }, party: [] })).toBe(true);
    expect(goalMet(kari, { state: 'active' }, { bag: {}, party: ['poliwag'] })).toBe(false);
    expect(goalMet(kari, { state: 'active' }, { bag: {}, party: ['psyduck', 'cindlet', 'poliwag'] })).toBe(true);
    expect(goalMet(arne, { state: 'active', n: 5 }, empty)).toBe(false);
    expect(goalMet(arne, { state: 'active', n: 6 }, empty)).toBe(true);
    expect(questLogText(arne, { state: 'active', n: 2 })).toBe('Knock out wild Rattata for Farmer Arne (2 of 6)');
    expect(questLogText(kari, { state: 'active' })).toBe(kari.log);
  });

  it('count Rattata knocked out only while the quest is open, up to the goal', () => {
    const state = sideQuestState({ 'arne-rattata': { state: 'active', n: 4 } });
    expect(creditDefeats(state, ['finchlet', 'nibblet'])).toEqual([{ def: byId('arne-rattata'), n: 5 }]);
    expect(creditDefeats(state, ['nibblet', 'nibblet', 'nibblet'])[0].n).toBe(6);
    expect(creditDefeats(state, ['nibblet'])).toEqual([]);
    expect(state['arne-rattata'].n).toBe(6);
    const notTaken = sideQuestState({});
    expect(creditDefeats(notTaken, ['nibblet'])).toEqual([]);
    const done = sideQuestState({ 'arne-rattata': { state: 'done', n: 6 } });
    expect(creditDefeats(done, ['nibblet'])).toEqual([]);
  });

  it('load whatever an old or hand-edited save has', () => {
    expect(sideQuestState(undefined)).toEqual({});
    expect(sideQuestState([1])).toEqual({});
    expect(sideQuestState({ nobody: { state: 'active' }, 'pelle-pikachu': { state: 'maybe' }, 'kari-pond': 'done', 'bodil-supper': { state: 'done' } })).toEqual({ 'bodil-supper': { state: 'done' } });
    expect(sideQuestState({ 'arne-rattata': { state: 'active', n: 99 } })).toEqual({ 'arne-rattata': { state: 'active', n: 6 } });
    expect(sideQuestState({ 'arne-rattata': { state: 'active', n: 'lots' } })).toEqual({ 'arne-rattata': { state: 'active', n: 0 } });
  });

  it('put each giver in the world with a mark over their head', () => {
    const world = { heightAt: () => 2, colliders: [] } as unknown as World;
    const v = new Villager(byId('pelle-pikachu'), world);
    expect(world.colliders.length).toBe(1);
    expect(v.position.y).toBe(2);
    v.setMark('new');
    expect(v.markShown).toBe('new');
    v.setMark('ready');
    expect(v.markShown).toBe('ready');
    v.setMark(null);
    expect(v.markShown).toBeNull();
    v.update(0.1, v.position.clone().add(new THREE.Vector3(2, 0, 0)));
    expect(v.visible).toBe(true);
    v.update(0.1, new THREE.Vector3(5000, 0, 0));
    expect(v.visible).toBe(false);
  });
});
