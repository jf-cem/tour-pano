(function(root){
  'use strict';
  const geo=typeof module==='object'&&module.exports?require('./geo.js'):root.TourGeo;
  function route(nodes){
    const cumulative=[0];
    for(let i=1;i<nodes.length;i++)cumulative.push(cumulative[i-1]+geo.distance(nodes[i-1],nodes[i]));
    const total=cumulative.at(-1);
    function position(meters){
      const along=Math.max(0,Math.min(total,meters));
      let i=1;while(i<nodes.length-1&&cumulative[i]<along)i++;
      const a=nodes[i-1],b=nodes[i],t=(along-cumulative[i-1])/(cumulative[i]-cumulative[i-1]||1);
      return {lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t};
    }
    return {cumulative,total,position};
  }
  function createStraight(nodes,startIndex){
    const path=route(nodes),direction=startIndex===nodes.length-1?-1:1;
    let origin,heading=null,current=startIndex,pending=null,count=0,along=path.cumulative[startIndex],lastStamp=-Infinity;
    return {update(coords,accuracy,timestamp,calibrationDistance){
      if(!Number.isFinite(accuracy)||accuracy<0||accuracy>20||!Number.isFinite(timestamp)||timestamp<=lastStamp)return null;
      lastStamp=timestamp;
      if(!origin)origin={...coords};
      const displacement=geo.distance(origin,coords);
      if(heading===null&&displacement>=calibrationDistance)heading=geo.bearing(origin,coords);
      if(heading!==null){
        const forward=displacement*Math.cos((geo.bearing(origin,coords)-heading)*Math.PI/180);
        const target=Math.max(0,Math.min(path.total,path.cumulative[startIndex]+direction*forward));
        // Retain the anchor across small GPS oscillations, including at rest.
        if(Math.abs(target-along)>=Math.max(2,Math.min(6,accuracy/2)))along=target;
        let candidate=current;
        if(current<nodes.length-1&&along>(path.cumulative[current]+path.cumulative[current+1])/2+1)candidate=current+1;
        else if(current>0&&along<(path.cumulative[current]+path.cumulative[current-1])/2-1)candidate=current-1;
        if(candidate===current){pending=null;count=0;}
        else {if(candidate===pending)count++;else {pending=candidate;count=1;}if(count>=2){current=candidate;pending=null;count=0;}}
      }
      return {coords:path.position(along),along,id:nodes[current].id,calibrating:heading===null,remaining:Math.max(0,calibrationDistance-displacement),end:along===path.total||along===0};
    }};
  }
  function createSimulation(nodes,startIndex,speed,pauseSeconds,now,mode='auto'){
    const path=route(nodes);
    let direction=mode==='return'?-1:mode==='outbound'?1:startIndex===nodes.length-1?-1:1;
    let returning=false;
    let index=startIndex,along=path.cumulative[index],hold=pauseSeconds,last=now,paused=false,done=false;
    return {
      setPaused(value,now){paused=value;last=now;},
      tick(now){
        let seconds=Math.max(0,(now-last)/1000);last=now;
        while(seconds>0&&!paused&&!done){
          if(hold>0){const spent=Math.min(hold,seconds);hold-=spent;seconds-=spent;continue;}
          const next=index+direction;
          if(next<0||next>=nodes.length){
            if(mode==='roundtrip'&&!returning){direction=-direction;returning=true;hold=pauseSeconds;continue;}
            done=true;break;
          }
          const duration=Math.abs(path.cumulative[next]-along)/speed;
          if(seconds<duration){along+=direction*speed*seconds;seconds=0;}
          else {
            along=path.cumulative[next];index=next;seconds-=duration;hold=pauseSeconds;
            if(mode==='roundtrip'&&!returning&&(index===0||index===nodes.length-1)){direction=-direction;returning=true;}
          }
        }
        return {coords:path.position(along),along,id:nodes[index].id,direction,paused,waiting:hold>0,lookProgress:pauseSeconds>0?1-hold/pauseSeconds:1,done};
      }
    };
  }
  function sweepAngle(progress,options={}){
    const p=Math.max(0,Math.min(1,progress));
    if(options.mode==='360')return (options.direction==='left'?-360:360)*p*p*(3-2*p);
    const points=[[0,0],[0.25,options.right??90],[0.75,-(options.left??90)],[1,0]];
    let i=1;while(i<3&&p>points[i][0])i++;
    const [a,x]=points[i-1],[b,y]=points[i],t=(p-a)/(b-a);
    return x+(y-x)*t*t*(3-2*t);
  }
  const api={route,createStraight,createSimulation,sweepAngle};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.TourWalk=api;
})(typeof window==='undefined'?globalThis:window);
