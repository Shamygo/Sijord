import { afterEach, describe, expect, it, vi } from 'vitest';
import { Input } from '../src/client/core/input';
import { DEFAULT_SETTINGS } from '../src/client/core/settings';
function fixture() {
  vi.useFakeTimers(); vi.spyOn(performance,'now').mockReturnValue(0);
  vi.stubGlobal('addEventListener',vi.fn());
  const handlers=new Map<string,()=>void>();
  const doc={addEventListener:(type:string,fn:()=>void)=>handlers.set(type,fn),pointerLockElement:null as Element|null,exitPointerLock:vi.fn()};
  vi.stubGlobal('document',doc);
  const capture=vi.fn();let allowed=true;
  const canvas={requestPointerLock:capture} as unknown as HTMLCanvasElement;
  const input=new Input(canvas,()=>DEFAULT_SETTINGS,()=>{},()=>allowed);
  return {input,capture,canvas,doc,handlers,block:()=>{allowed=false;}};
}
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
describe('pointer capture retries',()=>{
  it('cancels a delayed gameplay capture when a menu releases the mouse',()=>{const f=fixture();f.input.requestLock();f.input.releaseLock();vi.advanceTimersByTime(1200);expect(f.capture).not.toHaveBeenCalled();});
  it('checks the current overlay state before a delayed capture',()=>{const f=fixture();f.input.requestLock();f.block();vi.advanceTimersByTime(1200);expect(f.capture).not.toHaveBeenCalled();});
  it('releases an in-flight capture granted after an overlay opens',()=>{const f=fixture();f.input.requestLock();vi.advanceTimersByTime(1200);f.block();f.doc.pointerLockElement=f.canvas;f.handlers.get('pointerlockchange')!();expect(f.input.locked).toBe(false);expect(f.doc.exitPointerLock).toHaveBeenCalledOnce();});
  it('rejects a cancelled in-flight capture even if the overlay has already closed',()=>{const f=fixture();f.input.requestLock();vi.advanceTimersByTime(1200);f.input.releaseLock();f.doc.pointerLockElement=f.canvas;f.handlers.get('pointerlockchange')!();expect(f.input.locked).toBe(false);expect(f.doc.exitPointerLock).toHaveBeenCalledOnce();});
  it('accepts an explicit gameplay request once the cooldown ends',()=>{const f=fixture();f.input.requestLock();vi.advanceTimersByTime(1200);expect(f.capture).toHaveBeenCalledOnce();});
});
