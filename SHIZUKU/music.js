/* Shared musical structure for touch and the finished phrase. */
(function(root){
  const beat=.75;
  const harmony=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,57,59]];
  const scale=[60,62,64,67,69,72,74,76,79];
  function dropChord(drop,bar){
    const pitches=harmony[((bar%harmony.length)+harmony.length)%harmony.length].map(n=>60+((n%12)+12)%12).sort((a,b)=>a-b);
    const inversion=Math.abs(drop.n)%pitches.length;
    for(let k=0;k<inversion;k++)pitches.push(pitches.shift()+12);
    return pitches;
  }
  function compose(record,drops){
    if(!record.length)return {events:[],bars:[],codaStart:0,end:0};
    let pulse=0,previous=67;
    const events=record.map((e,k)=>{
      if(k){const gap=Math.max(0,e.t-record[k-1].t);pulse+=Math.max(.5,Math.min(2,Math.round(gap/(beat*.5))*.5));}
      let pitch=scale[Math.abs(drops[e.i].n)%scale.length];
      while(pitch-previous>7)pitch-=12;while(previous-pitch>7)pitch+=12;
      pitch=Math.max(60,Math.min(81,pitch));previous=pitch;
      return {i:e.i,pitch,at:pulse*beat,duration:beat*1.7,ending:false};
    });
    // A deliberate four-note cadence follows even a single touched drop.
    const codaStart=(Math.floor(pulse/4)+1)*4*beat;
    const route=record.slice(-4).map(e=>e.i);
    [69,67,62,60].forEach((pitch,k)=>events.push({i:route[k%route.length],pitch,at:codaStart+k*beat,duration:k===3?beat*4:beat*1.6,ending:true}));
    const end=codaStart+7*beat,bars=[];
    for(let at=0;at<codaStart;at+=4*beat)bars.push({at,notes:harmony[Math.round(at/(4*beat))%4]});
    bars.push({at:codaStart,notes:[43,50,55,59]},{at:codaStart+3*beat,notes:[48,55,60,64]});
    return {events,bars,codaStart,end};
  }
  const api={beat,harmony,scale,dropChord,compose};root.ShizukuMusic=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis==='undefined'?this:globalThis);
