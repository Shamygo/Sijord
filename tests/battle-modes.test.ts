import { describe, expect, it } from 'vitest';
import { Battle } from '../src/shared/battle/engine';
import { createCreature } from '../src/shared/battle/creature';
import { Rng } from '../src/shared/battle/rng';
import { spatialHit } from '../src/shared/battle/action';
const mon = (uid:string) => createCreature('nibblet',8,new Rng(77),{uid,moves:['tackle']});
function setup(hitTest?: () => boolean) {
 return new Battle({seed:7,kind:'wild',hitTest,sides:[
  {teams:[{owner:'host',name:'Host',creatures:[mon('host-1'),mon('host-2')]}],slots:['host','host']},
  {teams:[{owner:'foe',name:'Wild',creatures:[mon('foe-1')],ai:'wild'}],slots:['foe','foe']}
 ]});
}
describe('battle mode integration',()=>{
 it('accepts one partner before send-outs, gives independent ownership and prevents late or duplicate joins',()=>{
  const b=setup();expect(b.invitePartner({owner:'guest',name:'Guest',creatures:[mon('guest-1')]})).toBe(true);
  expect(b.invitePartner({owner:'third',name:'Third',creatures:[mon('third')]})).toBe(false);
  b.start();expect(b.slotOwner({side:0,slot:1})).toBe('guest');expect(b.at({side:0,slot:1})?.uid).toBe('guest-1');
  expect(b.invitePartner({owner:'late',name:'Late',creatures:[mon('late')]})).toBe(false);
  b.choose({side:0,slot:0},{kind:'pass'});b.choose({side:0,slot:1},{kind:'move',move:0,target:{side:1,slot:0}});
  expect(b.ready()).toBe(true);expect(b.resolve(()=>({kind:'pass'})).some(e=>e.t==='damage'&&e.pos.side===1)).toBe(true);
  b.commit();expect(b.team('guest')[0].creature.moves[0].pp).toBe(34);
 });
 it('a spatial dodge yields a miss while still consuming PP; tactical damage is unchanged',()=>{
  const b=setup(()=>false);b.start();b.choose({side:0,slot:0},{kind:'move',move:0,target:{side:1,slot:0}});b.choose({side:0,slot:1},{kind:'pass'});
  const before=b.at({side:1,slot:0})!.hp;const ev=b.resolve(()=>({kind:'pass'}));
  expect(ev.some(e=>e.t==='miss')).toBe(true);expect(b.at({side:1,slot:0})!.hp).toBe(before);expect(b.at({side:0,slot:0})!.moves[0].pp).toBe(34);
  const tactical=setup();tactical.start();tactical.choose({side:0,slot:0},{kind:'move',move:0,target:{side:1,slot:0}});tactical.choose({side:0,slot:1},{kind:'pass'});
  expect(tactical.resolve(()=>({kind:'pass'})).some(e=>e.t==='damage')).toBe(true);
 });
 it('dodging and leaving the impact zone avoid hits, while staying in range does not',()=>{
  expect(spatialHit({x:0,z:0},{x:0,z:0},true)).toBe(false);
  expect(spatialHit({x:0,z:0},{x:2,z:0},false)).toBe(false);
  expect(spatialHit({x:0,z:0},{x:.5,z:.5},false)).toBe(true);
 });
});
