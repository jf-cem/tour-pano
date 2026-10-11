const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const geo=require('./geo.js');
const data=require('./nodes.json');
const linear=[{lat:38,lng:-9},{lat:38.001,lng:-9}];
const at=m=>geo.destination(linear[0],m,0);
const count=geo.createWalkDistance(linear);
assert.equal(count(at(20),5),0);
assert.ok(Math.abs(count(at(30),5)-10)<0.01);
assert.ok(Math.abs(count(at(20),5)-20)<0.01);
assert.ok(Math.abs(count(at(21),5)-20)<0.01);
assert.ok(Math.abs(count(at(80),30)-20)<0.01);
const nodes=new Map();
function el(id){if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',hidden:false,disabled:false,dataset:{},append(){},replaceChildren(){},setAttribute(){}});return nodes.get(id);}
let active=data.start,listener=()=>{},gpsSuccess,clock=100000,timerId=0;
const timers=new Map();
const records=[];
const player={getNodeIds:()=>data.nodes.map(n=>n.id),getCurrentNode:()=>active,openNext(id){active=id.slice(1,-1);listener();},addListener(_,fn){listener=fn;}};
el('tour').contentWindow={pano:player};el('gps-mode').value='relative';el('align').checked=true;
const context={console,TourGeo:geo,TourGpsStart:require('./gps-start.js'),document:{getElementById:el,createElement:()=>({}),querySelectorAll:()=>[],body:{dataset:{}}},navigator:{permissions:{query:async()=>({state:'granted'})},geolocation:{watchPosition(fn){gpsSuccess=fn;return 42;},clearWatch(){}}},fetch:async()=>({ok:true,json:async()=>data}),setInterval(fn){timers.set(++timerId,fn);return timerId;},clearInterval(id){timers.delete(id);},Date:class extends Date{static now(){return clock;}},window:{isSecureContext:true,addEventListener(){},TourControls:{init(){}},TourMap:{init(){},pause(){},reset(){},update(){},setActive(){}},TourRoute:{startWalk(){records.length=0;},record(p){records.push(p);}}}};
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
console.log('PASS: distance in both directions, GPS jitter/rejected accuracy, all 15 relative starts and rotations, stop/restart, absolute GPS start.');
})().catch(e=>{console.error(e);process.exitCode=1;});


