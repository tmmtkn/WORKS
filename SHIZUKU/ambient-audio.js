/* PCM sound files provide an independent output path from Web Audio. */
(function(root){
 const rate=22050;
 function render(notes,duration){
  const size=Math.ceil(duration*rate),dry=new Float32Array(size);
  for(const n of notes){
   const from=Math.floor(n.at*rate),length=Math.min(Math.floor((n.duration+1)*rate),size-from),hz=440*Math.pow(2,(n.pitch-69)/12),soft=n.kind==='mist';
   for(let j=0;j<length;j++){
    const t=j/rate,phase=2*Math.PI*hz*(t+.65*.018*(1-Math.exp(-t/.018)));
    const contact=(1-Math.exp(-t/.0035))*Math.exp(-t/(soft?.28:.19));
    const resonance=(1-Math.exp(-t/.035))*Math.exp(-t/(soft?1.3:.85));
    const body=Math.sin(phase)*contact*(soft?.22:1)+Math.sin(2*Math.PI*hz*t)*resonance*.28;
    const modes=(Math.sin(phase*2.76)*.055*Math.exp(-t/.045)+Math.sin(phase*4.07)*.013*Math.exp(-t/.025))*(1-Math.exp(-t/.002));
    const fade=Math.min(1,(length-j)/(rate*.25));
    dry[from+j]+=n.level*(body+(soft?0:modes))*fade;
   }
  }
  // Damped, unequal room paths spread each short contact into a soft space.
  const lengths=[1499,2111,2633,3187],rooms=lengths.map(n=>new Float32Array(n)),heads=[0,0,0,0],damped=[0,0,0,0];
  const left=new Float32Array(size),right=new Float32Array(size);let peak=0;
  for(let j=0;j<size;j++){
   let l=0,r=0;
   for(let k=0;k<4;k++){
    const x=rooms[k][heads[k]];damped[k]+=.24*(x-damped[k]);
    rooms[k][heads[k]]=dry[j]+damped[k]*.79;heads[k]=(heads[k]+1)%lengths[k];
    l+=x*(k%2?.10:.17);r+=x*(k%2?.17:.10);
   }
   const fade=Math.min(1,(size-j)/(rate*.8));
   left[j]=(dry[j]+l)*fade;right[j]=(dry[j]+r)*fade;peak=Math.max(peak,Math.abs(left[j]),Math.abs(right[j]));
  }
  const gain=peak>.92?.92/peak:1,buffer=new ArrayBuffer(44+size*4),v=new DataView(buffer);const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,36+size*4,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,size*4,true);
  for(let i=0;i<size;i++){v.setInt16(44+i*4,Math.round(left[i]*gain*32760),true);v.setInt16(46+i*4,Math.round(right[i]*gain*32760),true);}
  return buffer;
 }
 function scoreNotes(score,beat,offset){
  const list=[];
  score.bars.forEach(b=>b.notes.slice(0,3).forEach((p,k)=>list.push({pitch:p+12,at:offset+b.at+[.1,.35,.7][k],duration:4.5,level:.023,kind:'mist'})));
  score.events.forEach(e=>list.push({pitch:e.pitch,at:offset+e.at,duration:e.duration,level:e.ending?.13:.16}));return list;
 }
 class MediaAudio{
  constructor(track,onError){this.track=track;this.onError=onError;this.pool=Array.from({length:12},()=>new Audio());this.index=0;this.timers=[];this.cache=new Map();this.urls=[];this.muted=false;this.unlocked=false;track.addEventListener('error',()=>onError('音声ファイルを読み込めませんでした。'));}
  url(notes,duration){const url=URL.createObjectURL(new Blob([render(notes,duration)],{type:'audio/wav'}));this.urls.push(url);return url;}
  unlock(){if(this.unlocked)return Promise.resolve();this.unlocked=true;const silent=this.url([],0.05);for(const p of this.pool){p.src=silent;p.volume=.9;p.play().catch(()=>{});}return Promise.resolve();}
  setMuted(value){this.muted=value;this.pool.forEach(p=>p.muted=value);this.track.muted=value;}
  note(pitch,delay,duration,level){this.cluster([pitch],delay,duration,level);}
  cluster(pitches,delay,duration,level){
   const fire=()=>{const p=this.pool[this.index++%this.pool.length],key=[pitches.join(','),duration,level].join(':');let url=this.cache.get(key);if(!url){url=this.url(pitches.map((pitch,k)=>({pitch,at:k===pitches.length-1?0:.035+k*.039,duration,level:level*(k===pitches.length-1?2.2:.64),kind:k===pitches.length-1?'drop':'mist'})),duration+3);this.cache.set(key,url);}p.pause();p.src=url;p.muted=this.muted;p.currentTime=0;p.play().catch(error=>{if(error.name!=='AbortError')this.onError('音の開始が止められました。「音を確かめる」を押してください。');});};
   if(delay>.015)this.timers.push(setTimeout(fire,delay*1000));else fire();
  }
  confirm(){this.unlock();this.stop();this.track.src='assets/ambient-confirmation.wav';this.track.muted=false;this.setMuted(false);return this.track.play();}
  async score(score,beat,offset){this.stop();if(this.scoreUrl)URL.revokeObjectURL(this.scoreUrl);this.scoreUrl=this.url(scoreNotes(score,beat,offset),score.end+offset+.3);this.track.src=this.scoreUrl;this.track.muted=this.muted;this.track.currentTime=0;await this.track.play();}
  stop(){this.timers.forEach(clearTimeout);this.timers=[];this.pool.forEach(p=>p.pause());this.track.pause();}
 }
 const api={render,scoreNotes,MediaAudio};root.ShizukuMedia=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis==='undefined'?this:globalThis);
