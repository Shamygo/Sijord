import {chromium} from 'playwright';
import path from 'node:path';
import os from 'node:os';
const outputDir=path.resolve(process.env.QA_OUTPUT||path.join(os.tmpdir(),'sijord-movement-qa'));
await fs.mkdir(outputDir,{recursive:true});
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true});const errors=[];
try {
 const p=await browser.newPage({viewport:{width:1280,height:800}});p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('sijord.settings.v1',JSON.stringify({quality:'low',showControlsHint:false}));localStorage.setItem('sijord.save.v1',JSON.stringify({room:'movement-qa',flags:[],profile:{name:'Trainer',playerClass:'ranger',appearance:{skinTone:'#f1c27d',hairColor:'#1c1c1c',hairStyle:0,jacketColor:'#d63a2f',pantsColor:'#3d4e6b',build:0}}}));});
 await p.goto(process.env.QA_URL||'http://127.0.0.1:5173/');await p.getByRole('button',{name:'Continue',exact:true}).click();await p.waitForFunction(()=>window.sijord?.avatar.root.userData.animations,null,{timeout:120000});
 const gait=await p.evaluate(async()=>{
  const g=window.sijord,T=await import('/node_modules/.vite/deps/three.js');g.renderer.setAnimationLoop(null);g.debugTeleport(0,-300,0);
  const render=g.pipeline.render.bind(g.pipeline);g.pipeline.render=()=>{};
  const rows=[];const input={forward:1,right:0,sprint:false,jump:false};
  for(let i=0;i<240;i++){
   g.controller.update(1/60,input,0,g.world);const s=g.controller.snapshot();g.avatar.root.position.copy(g.controller.position);g.avatar.root.rotation.y=s.yaw;g.avatar.animate(1/60,s);g.avatar.root.updateMatrixWorld(true);
   if(i>=60)rows.push({speed:s.speed,z:s.z,rate:g.avatar.root.userData.animationRate,clip:g.avatar.root.userData.currentClip,feet:['left_foot','right_foot'].map(n=>g.avatar.root.getObjectByName(n).getWorldPosition(new T.Vector3()).toArray())});
  }
  g.cam.snapBehind(g.controller.position,0);g.world.update(0,g.elapsed,g.controller.position);g.pipeline.render=render;render(0);return rows;
 });
 await p.screenshot({path:path.join(outputDir,'walk.png')});
 // Drive a freshly instantiated actual stage; battle animation/tweens cannot conceal a turn snap.
 const battle=await p.evaluate(async()=>{
  const g=window.sijord,T=await import('/node_modules/.vite/deps/three.js'),{BattleStage}=await import('/src/client/battle/stage.ts');
  const stage=new BattleStage(g.world,g.controller.position.clone(),0),pos={side:0,slot:0};g.scene.add(stage.root);stage.mirror(pos,'cindlet',stage.spot(pos).toArray(),true);const slot=stage.slots.get('0:0');slot.remoteTarget=false;stage.setActionMode();const start=slot.root.rotation.y;stage.pilot(pos,{x:1,z:0,sprint:false,dodge:false});stage.update(1/60);const first=slot.root.rotation.y;
  if(Math.abs(first-start)<.05||Math.abs(first-start)>.8)throw Error('First-frame Pokémon turn snapped');
  for(let i=0;i<30;i++)stage.update(1/60);const settled=slot.root.rotation.y;if(Math.abs(settled-Math.PI/2)>.1)throw Error('Facing never settled');stage.pilot(pos,{x:-1,z:0,sprint:false,dodge:false});stage.update(1/60);const reverse=slot.root.rotation.y;if(Math.abs(reverse-settled)>.8)throw Error('Reversal snapped');
  stage.pilot(pos,{x:0,z:0,sprint:false,dodge:false});for(let i=0;i<30;i++)stage.update(1/60);
  stage.pilots.clear();stage.mirror(pos,'cindlet',stage.snapshotPosition(pos),true);const target=stage.snapshotPosition(pos);target[0]+=.7;stage.mirror(pos,'cindlet',target,true);const remoteBefore=slot.root.position.x;stage.update(1/60);const remoteFirst=slot.root.position.x;if(Math.abs(remoteFirst-remoteBefore)<.05||Math.abs(remoteFirst-remoteBefore)>.3)throw Error('Remote position snapped');
  const report={start,first,settled,reverse,remoteBefore,remoteFirst,target:target[0]};g.scene.remove(stage.root);stage.dispose();return report;
 });
 await fs.writeFile(path.join(outputDir,'gait-samples.json'),JSON.stringify(gait));
 const planted=[];for(let i=1;i<gait.length;i++)for(let foot=0;foot<2;foot++){const a=gait[i-1].feet[foot],b=gait[i].feet[foot];if(b[1]<Math.min(...gait.map(r=>Math.min(...r.feet.map(f=>f[1]))))+.07 && b[2]-a[2]<gait[i].speed/60)planted.push((b[2]-a[2])*60)}
 planted.sort((a,b)=>a-b);const median=planted[Math.floor(planted.length/2)];const report={errors,battle,walkRate:gait.at(-1).rate,walkSpeed:gait.at(-1).speed,medianSupportFootWorldSpeed:median,supportSamples:planted.length};
 if(planted.length<40)throw Error('Insufficient support-foot samples');
 if(Math.abs(median)>1.5)throw Error('Feet still sliding: '+median);if(errors.length)throw Error(errors.join(';'));
 await fs.writeFile(path.join(outputDir,'verification.json'),JSON.stringify(report,null,2));console.log(report);
}finally{await browser.close();}
