/* PCM sound files provide an independent output path from Web Audio. */
(function(root){
 const rate=22050;
 function render(notes,duration){
  const size=Math.ceil(duration*rate),samples=new Float32Array(size);
  for(const n of notes){
   const from=Math.floor(n.at*rate),length=Math.min(Math.floor(n.duration*rate),size-from),hz=440*Math.pow(2,(n.pitch-69)/12);
   const warmth=Math.pow(.92,Math.max(0,n.pitch-69)/3);
   for(let j=0;j<length;j++){
    const t=j/rate,attack=1-Math.exp(-t/.045),release=Math.min(1,(length-j)/(rate*.42));
    const envelope=attack*attack*Math.exp(-t*3.8/n.duration)*release*release;
    const phase=2*Math.PI*hz*t;
    // Soft fundamental with brief, very quiet wooden overtones.
    const body=Math.sin(phase)+.065*Math.exp(-t*2.8)*Math.sin(phase*2.0007)+.012*Math.exp(-t*5)*Math.sin(phase*3.001);
    samples[from+j]+=n.level*warmth*envelope*body;
   }
  }
  // Low-level, diffused reflections. No regular repeating echo or hard saturation.
  const dry=samples.slice(),delays=[.071,.109,.163,.227],weights=[.10,.075,.055,.04];
  let room=0;
  for(let j=0;j<size;j++){
   let reflections=0;for(let k=0;k<delays.length;k++){const at=j-Math.floor(delays[k]*rate);if(at>=0)reflections+=dry[at]*weights[k];}
   room+=.19*(reflections-room);samples[j]+=room;
  }
  const buffer=new ArrayBuffer(44+size*2),v=new DataView(buffer);const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,36+size*2,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,size*2,true);
  for(let i=0;i<size;i++)v.setInt16(44+i*2,Math.round(Math.max(-.97,Math.min(.97,samples[i]*1.1))*32760),true);
  return buffer;
 }
 function scoreNotes(score,beat,offset){const list=[];score.bars.forEach(b=>{b.notes.forEach((p,k)=>list.push({pitch:p,at:offset+b.at+k*.045,duration:beat*4,level:.035}));[0,2,1,3].forEach((n,k)=>list.push({pitch:b.notes[n]+12,at:offset+b.at+k*beat,duration:beat*1.6,level:.028}));});score.events.forEach(e=>list.push({pitch:e.pitch,at:offset+e.at,duration:e.duration,level:.16}));return list;}
 class MediaAudio{
  constructor(track,onError){this.track=track;this.onError=onError;this.pool=Array.from({length:12},()=>new Audio());this.index=0;this.timers=[];this.cache=new Map();this.urls=[];this.muted=false;this.unlocked=false;track.addEventListener('error',()=>onError('音声ファイルを読み込めませんでした。'));}
  url(notes,duration){const url=URL.createObjectURL(new Blob([render(notes,duration)],{type:'audio/wav'}));this.urls.push(url);return url;}
  unlock(){if(this.unlocked)return Promise.resolve();this.unlocked=true;const silent=this.url([],0.05);for(const p of this.pool){p.src=silent;p.volume=.9;p.play().catch(()=>{});}return Promise.resolve();}
  setMuted(value){this.muted=value;this.pool.forEach(p=>p.muted=value);this.track.muted=value;}
  note(pitch,delay,duration,level){this.cluster([pitch],delay,duration,level);}
  cluster(pitches,delay,duration,level){
   const fire=()=>{const p=this.pool[this.index++%this.pool.length],key=[pitches.join(','),duration,level].join(':');let url=this.cache.get(key);if(!url){url=this.url(pitches.map((pitch,k)=>({pitch,at:k*.016,duration,level})),duration+.16);this.cache.set(key,url);}p.pause();p.src=url;p.muted=this.muted;p.currentTime=0;p.play().catch(()=>this.onError('音の開始が止められました。「音を確かめる」を押してください。'));};
   if(delay>.015)this.timers.push(setTimeout(fire,delay*1000));else fire();
  }
  confirm(){this.unlock();this.stop();this.track.src='assets/confirmation.wav';this.track.muted=false;this.setMuted(false);return this.track.play();}
  async score(score,beat,offset){this.stop();if(this.scoreUrl)URL.revokeObjectURL(this.scoreUrl);this.scoreUrl=this.url(scoreNotes(score,beat,offset),score.end+offset+.3);this.track.src=this.scoreUrl;this.track.muted=this.muted;this.track.currentTime=0;await this.track.play();}
  stop(){this.timers.forEach(clearTimeout);this.timers=[];this.pool.forEach(p=>p.pause());this.track.pause();}
 }
 const api={render,scoreNotes,MediaAudio};root.ShizukuMedia=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis==='undefined'?this:globalThis);
