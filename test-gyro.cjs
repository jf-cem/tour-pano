const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('pano2vr_player.js','latin1');
const start=source.indexOf('xw(t,e,n,i){'),end=source.indexOf('$f(){',start);
assert.ok(start>=0&&end>start,'bundled orientation handler identified');
// Known yaw/tilt matrix samples isolate the player response from device calibration.
class Matrix {
  constructor(){this.n12=0;this.n32=Math.sin(20*Math.PI/180);this.n22=Math.cos(20*Math.PI/180);}
  rotY(angle){this.n13=Math.sin(-angle*Math.PI/180);this.n11=Math.cos(-angle*Math.PI/180);}
  rotZ(){} rotX(){}
}
const handler=new Function('BL','window','return function '+source.slice(start,end))(Matrix,{orientation:0});
let pan=40,tilt=0;
const player={Jv:{},jv:{},LI:true,NI:false,kt:{active:false,inInertia:false},gw:()=>false,
  Ne:()=>pan,Fe:()=>tilt,Ue:()=>0,$o:value=>{pan=((value+180)%360+360)%360-180;},
  setTilt__:value=>{tilt=value;},XA(){},ki(){}};
function sample(alpha){handler.call(player,alpha,0,0,false);}
player.Jv.resetPanOffset=true;sample(0);assert.equal(pan,40,'enable does not jump');
for(let i=0;i<10;i++)sample(10);
assert.ok(Math.abs(pan-50)<1e-8,'yaw moves in the reversed horizontal direction');
assert.ok(Math.abs(tilt-20)<1e-8,'vertical tilt is unchanged');
sample(350);assert.ok(Math.abs(pan-30)<1e-8,'yaw handles 0/360 wrap');
sample(10);assert.ok(Math.abs(pan-50)<1e-8);
pan=120;player.Jv.resetPanOffset=true;sample(50);assert.equal(pan,120);
for(let i=0;i<10;i++)sample(60);
assert.ok(Math.abs(pan-130)<1e-8,'recenter uses matching reversed offset');
player.LI=false;sample(90);assert.ok(Math.abs(pan-130)<1e-8,'disabled gyro leaves camera alone');
console.log('PASS: bundled gyro horizontal reversal, tilt preservation, wrap, recenter and disable');
const vm=require('node:vm'),listeners={},elements=new Map();
let enabled=false,heading=15;
function el(id){if(!elements.has(id))elements.set(id,{setAttribute(){},contentDocument:{querySelectorAll:()=>[]}});return elements.get(id);}
const context={window:{addEventListener(){}},document:{getElementById:el},requestAnimationFrame(){},
  MutationObserver:class{observe(){} disconnect(){}},setTimeout(){},clearTimeout(){}};
vm.createContext(context);vm.runInContext(fs.readFileSync('tour-controls.js','utf8'),context);
context.window.TourControls.init({getUseGyro:()=>enabled,getPan:()=>heading,setPan:p=>heading=p,addListener:(name,fn)=>listeners[name]=fn});
assert.equal(heading,15,'no correction with gyro disabled');
enabled=true;listeners.gyrochanged();assert.equal(heading,105,'90 degree compensation on activation');
listeners.gyrochanged();assert.equal(heading,105,'duplicate event does not accumulate correction');
enabled=false;listeners.gyrochanged();enabled=true;listeners.gyrochanged();assert.equal(heading,105,'toggle does not accumulate correction');
console.log('PASS: real control heading offset applies once and preserves toggles');
