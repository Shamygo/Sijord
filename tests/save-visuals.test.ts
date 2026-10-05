import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSave, writeSave, type SaveData } from '../src/client/core/save';
const original={profile:{name:'Trainer',playerClass:'ranger',appearance:{trainerModel:'red',skinTone:'#fff'}},room:'friends',flags:['met-professor'],bag:{potion:4},party:[{species:'cindlet',hp:12,level:5}]} as unknown as SaveData;
function storage(data:SaveData) {let value=JSON.stringify(data);vi.stubGlobal('localStorage',{getItem:()=>value,setItem:(_:string,next:string)=>{value=next;}});return ()=>JSON.parse(value);}
afterEach(()=>vi.unstubAllGlobals());
describe('trainer visual migration',()=>{
  it('updates the previous default while preserving all progression',()=>{storage(original);const loaded=loadSave()!;expect(loaded.profile.appearance.trainerModel).toBe('rei');expect(loaded.party).toEqual(original.party);expect(loaded.bag).toEqual(original.bag);expect(loaded.flags).toEqual(original.flags);expect(loaded.room).toBe(original.room);});
  it('keeps a newly selected Red costume after saving',()=>{storage(original);writeSave(original);expect(loadSave()!.profile.appearance.trainerModel).toBe('red');});
  it('preserves existing custom appearance',()=>{storage({...original,profile:{...original.profile,appearance:{...original.profile.appearance,trainerModel:'custom'}}});expect(loadSave()!.profile.appearance.trainerModel).toBe('custom');});
});
