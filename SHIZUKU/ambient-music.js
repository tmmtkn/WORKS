/* Shared musical structure for touch and the finished phrase. */
(function(root){
  const beat=.75;
  const harmony=[[48,55,59,64],[45,52,55,60],[41,48,52,57],[43,50,57,59]];
  const scale=[60,62,64,67,69,72,74,76,79];
  function flowChord(drop,bar){
    const pitches=harmony[((bar%harmony.length)+harmony.length)%harmony.length].map(n=>48+((n%12)+12)%12).sort((a,b)=>a-b);
    const inversion=Math.abs(drop.n)%pitches.length;
    for(let k=0;k<inversion;k++)pitches.push(pitches.shift()+12);
    return pitches;
  }
  // A stable identity for each drop, using only C-major pentatonic tones.
  // Larger photographed drops sound in a lower register; no clock is involved.
  const dropPalette=[[0,4,7,9],[0,2,7,9],[0,2,4,9],[2,4,7,9],[0,2,4,7]];
  function dropChord(drop){
    const seed=Math.abs(Math.round(drop.sx*3+drop.sy*5+drop.sr*7));
    const base=drop.sr>=38?48:60;
    const pitches=dropPalette[seed%dropPalette.length].map(n=>base+n);
    if(Math.floor(seed/dropPalette.length)%2)pitches.push(pitches.shift()+12);
    return pitches;
  }
  function compose(record,drops){
    if(!record.length)return {events:[],bars:[],codaStart:0,end:0};
    // Keep the gesture's contour, but leave room for each water resonance to dissolve.
    const route=record.length<=16?record:Array.from({length:16},(_,k)=>record[Math.round(k*(record.length-1)/15)]);
    const waterScale=[48,50,52,55,57,60,62];let at=0,previous=55;
    const events=route.map((e,k)=>{
      if(k){const gap=Math.max(0,e.t-route[k-1].t);at+=Math.max(2.4,Math.min(4,gap*.65+2.1))+(k%3===1?.12:0);}
      let pitch=waterScale[Math.abs(drops[e.i].n)%waterScale.length];
      while(pitch-previous>7)pitch-=12;while(previous-pitch>7)pitch+=12;
      pitch=Math.max(48,Math.min(64,pitch));previous=pitch;
      return {i:e.i,pitch,at,duration:3.8,ending:false};
    });
    const codaStart=at+4,last=events.at(-1),index=waterScale.reduce((best,p,i)=>Math.abs(p-last.pitch)<Math.abs(waterScale[best]-last.pitch)?i:best,0);
    // A quiet echo of the motif, without a compulsory return to C.
    [index,Math.max(0,index-1),Math.min(waterScale.length-1,Math.max(1,index-2))].forEach((n,k)=>events.push({i:route[Math.max(0,route.length-1-k)].i,pitch:waterScale[n],at:codaStart+[0,3.2,7][k],duration:4.5,ending:true}));
    const bars=[];for(let t=0;t<codaStart;t+=9)bars.push({at:t,notes:harmony[Math.floor(t/9)%4]});
    return {events,bars,codaStart,end:events.at(-1).at+11};
  }
  const api={beat,harmony,scale,dropChord,flowChord,compose};root.ShizukuMusic=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis==='undefined'?this:globalThis);
