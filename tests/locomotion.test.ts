import {describe,it,expect} from 'vitest';
import {smoothFacing} from '../src/client/player/locomotion';

describe('continuous creature facing',()=>{
  it('turns gradually and uses the short path across the angle seam',()=>{
    expect(smoothFacing(0,Math.PI/2,1/60)).toBeGreaterThan(0);
    expect(smoothFacing(0,Math.PI/2,1/60)).toBeLessThan(Math.PI/4);
    expect(smoothFacing(Math.PI-.01,-Math.PI+.01,1/60)).toBeGreaterThan(Math.PI-.01);
  });
  it('has the same response at different rendering frame rates',()=>{
    let fast=0,slow=0;
    for(let i=0;i<60;i++)fast=smoothFacing(fast,2,1/60);
    for(let i=0;i<30;i++)slow=smoothFacing(slow,2,1/30);
    expect(fast).toBeCloseTo(slow,10);
    expect(fast).toBeCloseTo(2,4);
  });
});
