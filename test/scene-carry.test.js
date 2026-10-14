import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TrialScene } from '../public/trial-scene.js';

// A cena usa estes poucos campos do DOM; a verificação visual roda no navegador real.
function surface() {
  const classes=new Set(), styles=new Map();
  return {dataset:{},hidden:false,style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)},
    classList:{add:(...keys)=>keys.forEach(k=>classes.add(k)),remove:(...keys)=>keys.forEach(k=>classes.delete(k)),
      toggle:(key,on)=>on?classes.add(key):classes.delete(key),contains:key=>classes.has(key)}};
}
function fixture() {
  const scene=Object.create(TrialScene.prototype);
  const actor={login:'ana',slot:0,x:.65,y:0,heading:'right',serverState:'caught',visualState:'caught',queue:[],task:null,
    root:surface(),figure:surface(),bubble:surface(),facing:surface()};
  const hunter={x:.8,y:0,heading:'left',actorScale:3,queue:[],task:null,root:surface(),figure:surface(),facing:surface()};
  Object.assign(scene,{actors:new Map([['ana',actor]]),hunter,width:600,caption:{textContent:''}});
  scene.captivePosition=()=>({x:.1,y:-72});scene.bubble=()=>{};
  scene.seatCaptive(actor,false);
  return {scene,actor,hunter};
}
function start(hunter){hunter.task=hunter.queue.shift();return hunter.task;}
function reachHaul(scene,hunter,task) {
  for(let time=0;time<5000;time+=20){scene.updateCarry(hunter,task,time,.02);if(task.phase==='haul')return time;}
  assert.fail('O Pálido não levantou a vítima.');
}

test('captura derruba a vítima e agenda só o Pálido para buscá-la',()=>{
  const {scene,actor,hunter}=fixture();
  assert.equal(actor.root.dataset.captive,'downed');assert.equal(actor.figure.dataset.pose,'downed');
  assert.equal(actor.queue.length,0);assert.equal(hunter.queue.length,1);
  scene.seatCaptive(actor,false);assert.equal(hunter.queue.length,1);
});

test('Pálido levanta, carrega e deposita a vítima uma única vez nos grilhões',()=>{
  const {scene,actor,hunter}=fixture(),task=start(hunter);
  const time=reachHaul(scene,hunter,task);
  assert.equal(actor.carrier,hunter);assert.equal(actor.root.dataset.captive,'carried');
  assert.equal(actor.queue.length,0);assert.ok(hunter.root.classList.contains('is-carrying'));
  let lowered=false;
  for(let tick=time+20;tick<15000&&hunter.task;tick+=20){
    scene.updateCarry(hunter,task,tick,.02);lowered ||=task.phase==='putdown';
    assert.equal(hunter.y,0,'O Pálido deve permanecer no chão enquanto transporta e ergue a vítima.');
  }
  assert.equal(lowered,true);assert.equal(hunter.task,null);assert.equal(actor.carrier,null);
  assert.equal(actor.root.dataset.captive,'seated');assert.equal(actor.figure.dataset.pose,'seated');
  assert.equal(actor.x,.1);assert.equal(actor.y,-72);assert.equal(actor.queue.length,0);
  assert.equal(hunter.root.classList.contains('is-carrying'),false);
});

test('morte durante o trajeto cancela o transporte e não ressuscita o prisioneiro',()=>{
  const {scene,actor,hunter}=fixture(),task=start(hunter);
  const time=reachHaul(scene,hunter,task);actor.serverState='dead';
  scene.updateCarry(hunter,task,time+20,.02);
  assert.equal(actor.carrier,null);assert.equal(hunter.task,null);assert.equal(actor.visualState,'dead');
  assert.equal(actor.seated,false);assert.equal(actor.root.dataset.captive,undefined);
});

test('atualização sem animação e resgate limpam o vínculo sem deixar uma cópia no ombro',()=>{
  const {scene,actor,hunter}=fixture(),task=start(hunter);
  reachHaul(scene,hunter,task);scene.paintState(actor,'caught',{snap:true});
  assert.equal(actor.carrier,null);assert.equal(hunter.task,null);assert.equal(actor.root.dataset.captive,'seated');
  actor.captive=false;scene.seatCaptive(actor,false);const again=start(hunter);
  reachHaul(scene,hunter,again);scene.paintState(actor,'hurt');
  assert.equal(actor.carrier,null);assert.equal(hunter.task,null);assert.equal(actor.visualState,'hurt');
  assert.equal(actor.root.classList.contains('is-carried'),false);assert.equal(actor.root.dataset.captive,undefined);
});

test('sem um caçador na cena, o estado atual aparece sentado sem ficar preso na pose de queda',()=>{
  const {scene,actor}=fixture();scene.cancelCarry(actor);scene.hunter=null;
  scene.seatCaptive(actor,false);
  assert.equal(actor.awaitingCarry,false);assert.equal(actor.root.classList.contains('is-downed'),false);
  assert.equal(actor.root.dataset.captive,'seated');assert.equal(actor.figure.dataset.pose,'seated');
});
