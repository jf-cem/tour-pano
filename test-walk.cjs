const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const geo=require('./geo.js');
const data=require('./nodes.json');
const walk=require('./walk-playback.js');
const nodes=new Map();
function el(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,disabled:false,dataset:{},append(){},replaceChildren(){},setAttribute(){}});return nodes.get(id);}
let active=data.start,listener=()=>{},gpsSuccess,clock=100000,timerId=0;
const timers=new Map();
const frames=new Map();let pan=20,gyro=true;
const records=[];
const player={getNodeIds:()=>data.nodes.map(n=>n.id),getCurrentNode:()=>active,openNext(id){active=id.slice(1,-1);listener();},addListener(_,fn){listener=fn;}};
el('tour').contentWindow={pano:player};el('gps-mode').value='relative';el('align').checked=true;
const context={console,TourGeo:geo,TourGpsStart:require('./gps-start.js'),document:{getElementById:el,createElement:()=>({}),querySelectorAll:()=>[],body:{dataset:{}}},navigator:{permissions:{query:async()=>({state:'granted'})},geolocation:{watchPosition(fn){gpsSuccess=fn;return 42;},clearWatch(){}}},fetch:async()=>({ok:true,json:async()=>data}),setInterval(fn){timers.set(++timerId,fn);return timerId;},clearInterval(id){timers.delete(id);},Date:class extends Date{static now(){return clock;}},window:{isSecureContext:true,addEventListener(){},TourControls:{init(){}},TourMap:{init(){},pause(){},reset(){records.length=0;},update(p){records.push(p);},setActive(){}}}};
player.getPan=()=>pan;player.setPan=value=>{pan=value;};player.getUseGyro=()=>gyro;player.setUseGyro=value=>{gyro=value;};
context.requestAnimationFrame=fn=>{frames.set(++timerId,fn);return timerId;};context.cancelAnimationFrame=id=>frames.delete(id);
context.TourWalk=walk;
vm.createContext(context);context.window.TourGeo=geo;vm.runInContext(fs.readFileSync('gps-start.js','utf8'),context);context.TourGpsStart=context.window.TourGpsStart;vm.runInContext(fs.readFileSync('test-ui.js','utf8'),context);
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
(async()=>{
await flush();for(const fn of [...timers.values()])fn();await flush();
assert.equal(el('follow').disabled,false);
for(const first of data.nodes){
  el('start-panorama').value=first.id;el('start-panorama').onchange();
  el('follow').onclick();
  const origin={lat:40,lng:-8};
  for(let i=0;i<=5;i++){clock+=2000;gpsSuccess({coords:{latitude:origin.lat,longitude:origin.lng,accuracy:4},timestamp:clock});}
  assert.equal(active,first.id,first.title+' origin');
  assert.ok(records.length>0);assert.ok(geo.distance(records[0],first)<0.01);
  const next=data.nodes[data.nodes.indexOf(first)+1]||data.nodes[data.nodes.indexOf(first)-1];
  const position=geo.destination(origin,10,0);clock+=2000;
  gpsSuccess({coords:{latitude:position.lat,longitude:position.lng,accuracy:4},timestamp:clock});
  const expected=geo.destination(first,10,geo.bearing(first,next));
  assert.ok(geo.distance(records.at(-1),expected)<0.01,first.title+' rotation');
  el('stop').onclick();
}
el('gps-mode').value='absolute';el('gps-mode').onchange();el('follow').onclick();
const physical=data.nodes[7];for(let i=0;i<=5;i++){clock+=2000;gpsSuccess({coords:{latitude:physical.lat,longitude:physical.lng,accuracy:4},timestamp:clock});}
assert.equal(active,physical.id,'absolute GPS still selects nearest panorama');
el('stop').onclick();
// Walking straight follows route order through curves and supports returning.
const path=walk.route(data.nodes),origin={lat:40,lng:-8};
const straight=walk.createStraight(data.nodes,0);
let stamp=0;
function reading(m,accuracy=4){return straight.update(geo.destination(origin,m,90),accuracy,++stamp,8);}
reading(0);assert.equal(reading(4).calibrating,true);
assert.equal(reading(8.1).calibrating,false);
const visited=new Set([data.start]);
for(let meters=8;meters<=path.total+6;meters+=1){for(let j=0;j<3;j++)visited.add(reading(meters).id);}
assert.equal(visited.size,data.nodes.length,'straight walk visits every panorama in route order');
assert.equal(reading(path.total+6).id,data.nodes.at(-1).id);
assert.equal(reading(50,30),null,'poor accuracy rejected');
for(let meters=path.total;meters>=0;meters-=1){for(let j=0;j<3;j++)reading(meters);}
assert.equal(reading(0).id,data.start,'return along same straight line');
const reverse=walk.createStraight(data.nodes,data.nodes.length-1);
reverse.update(origin,4,1,8);const reverseState=reverse.update(geo.destination(origin,10,0),4,2,8);
assert.ok(Math.abs(reverseState.along-(path.total-10))<0.01);
// Simulation speed, holds, manual pause and end from all starting panoramas.
for(let i=0;i<data.nodes.length;i++){
  const sim=walk.createSimulation(data.nodes,i,1.4,2,0);
  const initial=sim.tick(1000);assert.equal(initial.along,path.cumulative[i]);
  const moving=sim.tick(3000);assert.ok(Math.abs(moving.along-path.cumulative[i])>0);
  sim.setPaused(true,3000);assert.equal(sim.tick(30000).along,moving.along);
  sim.setPaused(false,30000);assert.ok(Math.abs(sim.tick(31000).along-moving.along)>0);
  const end=sim.tick(1000000);assert.equal(end.done,true);assert.equal(end.id,i===data.nodes.length-1?data.start:data.nodes.at(-1).id);
}
const slow=walk.createSimulation(data.nodes,0,0.7,0,0).tick(1000);
const fast=walk.createSimulation(data.nodes,0,2.8,0,0).tick(1000);
assert.ok(Math.abs(fast.along/slow.along-4)<0.01);
// Exercise UI integration and cancel a saved callback after stopping.
el('gps-mode').value='relative';el('straight-walk').checked=true;el('straight-walk').onchange();
el('start-panorama').value=data.start;el('start-panorama').onchange();el('follow').onclick();
for(let i=0;i<=5;i++){clock+=2000;gpsSuccess({coords:{latitude:origin.lat,longitude:origin.lng,accuracy:4},timestamp:clock});}
for(let m=8;m<30;m+=2){clock+=2000;const p=geo.destination(origin,m,90);gpsSuccess({coords:{latitude:p.lat,longitude:p.lng,accuracy:4},timestamp:clock});}
assert.notEqual(active,data.start);el('stop').onclick();
el('simulation-speed').value='2.8';el('simulation-hold').value='2';el('route').onclick();
const callback=[...timers.values()].at(-1);clock+=3000;callback();const position=records.at(-1);
el('simulation-pause').onclick();clock+=100000;callback();assert.deepEqual(records.at(-1),position);
el('simulation-pause').onclick();clock+=1000;callback();assert.notDeepEqual(records.at(-1),position);
el('stop').onclick();const stopped=records.length;callback();assert.equal(records.length,stopped);
assert.equal(walk.sweepAngle(0),0);assert.equal(walk.sweepAngle(0.25),90);assert.equal(walk.sweepAngle(0.75),-90);assert.equal(walk.sweepAngle(1),0);
function cameraFrame(){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();}
el('simulation-look').checked=true;el('simulation-hold').value='10';el('simulation-camera-duration').value='10';el('route').onclick();
assert.equal(gyro,false);clock+=3000;cameraFrame();assert.ok(Math.abs(pan-110)<0.01);
clock+=5000;cameraFrame();assert.ok(Math.abs(pan+70)<0.01);
el('simulation-pause').onclick();cameraFrame();const pausedPan=pan;clock+=20000;cameraFrame();assert.equal(pan,pausedPan);
el('simulation-pause').onclick();clock+=2500;cameraFrame();assert.ok(Math.abs(pan-20)<0.01);
el('stop').onclick();assert.equal(frames.size,0);assert.equal(pan,20);assert.equal(gyro,true);
el('simulation-hold').value='0';el('route').onclick();assert.equal(frames.size,0);el('stop').onclick();
// Custom asymmetric sweeps and continuous full turns.
assert.equal(walk.sweepAngle(.25,{left:60,right:120}),120);
assert.equal(walk.sweepAngle(.75,{left:60,right:120}),-60);
assert.equal(walk.sweepAngle(.5,{mode:'360'}),180);
assert.equal(walk.sweepAngle(1,{mode:'360',direction:'left'}),-360);
const back=walk.createSimulation(data.nodes,8,1.4,2,0,'return');
assert.equal(back.tick(1000000).id,data.start);
const thereAndBack=walk.createSimulation(data.nodes,0,100,1,0,'roundtrip');
const order=[];for(let t=0;t<40000;t+=100){const state=thereAndBack.tick(t);if(order.at(-1)!==state.id)order.push(state.id);}
assert.deepEqual(order,[...data.nodes.map(n=>n.id),...data.nodes.slice(0,-1).reverse().map(n=>n.id)]);
assert.equal(thereAndBack.tick(40000).done,true);
const fromEnd=walk.createSimulation(data.nodes,14,100,1,0,'roundtrip');
assert.equal(fromEnd.tick(1000000).id,data.nodes.at(-1).id);
el('start-panorama').value=data.nodes[8].id;el('simulation-route').value='return';el('simulation-look').checked=false;el('route').onclick();
assert.equal(pan,data.nodes[8].forwardPan+180);el('stop').onclick();
console.log('PASS: automatic +/-90 degree sweep, pause/resume, camera restoration, zero-pause opt-out; 15 relative starts, GPS straight walk through curves and return, accuracy rejection, simulation speeds/holds/pause/resume/end, cancellation and absolute GPS.');
})().catch(e=>{console.error(e);process.exitCode=1;});


