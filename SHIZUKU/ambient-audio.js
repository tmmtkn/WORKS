/* PCM sound files provide an independent output path from Web Audio. */
(function(root){
 const rate=22050;
 let water;
 function setSample(buffer){
  const v=new DataView(buffer);let at=12,data=0,length=0;
  if(v.getUint16(22,true)!==1||v.getUint32(24,true)!==rate||v.getUint16(34,true)!==16)throw new Error('Water sample format');
  while(at+8<=v.byteLength){const size=v.getUint32(at+4,true);if(v.getUint32(at,false)===0x64617461){data=at+8;length=size/2;break;}at+=8+size+(size%2);}
  if(!data)throw new Error('Water sample missing');water=new Float32Array(length);for(let i=0;i<length;i++)water[i]=v.getInt16(data+i*2,true)/32768;
 }
 // Plain PCM decoding keeps Safari's working HTMLAudio playback path.
 let loading;
 function ready(){return loading||(loading=fetch('assets/water/body-c4.wav?v=deep2').then(r=>{if(!r.ok)throw new Error('Water sample unavailable');return r.arrayBuffer();}).then(setSample).catch(error=>{loading=null;throw error;}));}

 function render(notes,duration){
  const size=Math.ceil(duration*rate),dry=new Float32Array(size);
  if(notes.length&&!water)throw new Error('Water recording is not ready');
  for(const n of notes){
   const from=Math.floor(n.at*rate),speed=Math.pow(2,(n.pitch-60)/12),length=Math.min(Math.floor((water.length-1)/speed),size-from);
   const soft=n.kind==='mist';
   for(let j=0;j<length;j++){
    const position=j*speed,index=Math.floor(position),fraction=position-index,t=j/rate;
    const sample=water[index]*(1-fraction)+water[index+1]*fraction;
    const fade=Math.min(1,(length-j)/(rate*.7));
    dry[from+j]+=sample*n.level*(soft?.6:1)*(1-Math.exp(-t/(soft?.3:.07)))*fade;
   }
  }
  // All-pass diffusion softens reflections without adding pitched oscillators.
  for(const delay of [241,379,557]){
   const line=new Float32Array(delay);let head=0;
   for(let j=0;j<size;j++){const delayed=line[head],input=dry[j];dry[j]=delayed-input*.52;line[head]=input+dry[j]*.52;head=(head+1)%delay;}
  }
  // Damped, unequal room paths spread each short contact into a soft space.
  const lengths=[1499,2111,2633,3187],rooms=lengths.map(n=>new Float32Array(n)),heads=[0,0,0,0],damped=[0,0,0,0];
  const left=new Float32Array(size),right=new Float32Array(size);let peak=0;
  for(let j=0;j<size;j++){
   let l=0,r=0;
   for(let k=0;k<4;k++){
    const x=rooms[k][heads[k]];damped[k]+=.24*(x-damped[k]);
    rooms[k][heads[k]]=dry[j]+damped[k]*.86;heads[k]=(heads[k]+1)%lengths[k];
    l+=x*(k%2?.10:.17);r+=x*(k%2?.17:.10);
   }
   const fade=Math.min(1,(size-j)/(rate*.8));
   left[j]=(dry[j]*.85+l*1.2)*fade;right[j]=(dry[j]*.85+r*1.2)*fade;peak=Math.max(peak,Math.abs(left[j]),Math.abs(right[j]));
  }
  const gain=peak>.92?.92/peak:1,buffer=new ArrayBuffer(44+size*4),v=new DataView(buffer);const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,36+size*4,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,size*4,true);
  for(let i=0;i<size;i++){v.setInt16(44+i*4,Math.round(left[i]*gain*32760),true);v.setInt16(46+i*4,Math.round(right[i]*gain*32760),true);}
  return buffer;
 }
 function scoreNotes(score,beat,offset){
  const list=[];
  score.bars.forEach(b=>b.notes.slice(0,3).forEach((p,k)=>list.push({pitch:p,at:offset+b.at+[.1,.35,.7][k],duration:4.5,level:.035,kind:'mist'})));
  score.events.forEach(e=>list.push({pitch:e.pitch,at:offset+e.at,duration:e.duration,level:e.ending?.19:.23}));return list;
 }
 class MediaAudio{
  constructor(track,onError){this.track=track;this.onError=onError;this.pool=Array.from({length:12},()=>new Audio());this.index=0;this.timers=[];this.cache=new Map();this.urls=[];this.muted=false;this.unlocked=false;track.addEventListener('error',()=>onError('音声ファイルを読み込めませんでした。'));}
  url(notes,duration){const url=URL.createObjectURL(new Blob([render(notes,duration)],{type:'audio/wav'}));this.urls.push(url);return url;}
  unlock(){if(this.unlocked)return ready();this.unlocked=true;const silent=this.url([],0.05);for(const p of this.pool){p.src=silent;p.volume=.9;p.play().catch(()=>{});}return ready();}
  setMuted(value){this.muted=value;this.pool.forEach(p=>p.muted=value);this.track.muted=value;}
  note(pitch,delay,duration,level){this.cluster([pitch],delay,duration,level);}
  cluster(pitches,delay,duration,level){
   const fire=()=>{const p=this.pool[this.index++%this.pool.length],key=[pitches.join(','),duration,level].join(':');let url=this.cache.get(key);if(!url){url=this.url(pitches.map((pitch,k)=>({pitch,at:k===pitches.length-1?0:.035+k*.039,duration,level:level*(k===pitches.length-1?2.7:.95),kind:k===pitches.length-1?'drop':'mist'})),10);this.cache.set(key,url);}p.pause();p.src=url;p.muted=this.muted;p.currentTime=0;p.play().catch(error=>{if(error.name!=='AbortError')this.onError('音の開始が止められました。「音を確かめる」を押してください。');});};
   if(delay>.015)this.timers.push(setTimeout(fire,delay*1000));else fire();
  }
  async confirm(){await this.unlock();this.stop();this.track.src='assets/water/confirmation-deep.wav';this.track.muted=false;this.setMuted(false);return this.track.play();}
  async score(score,beat,offset){this.stop();if(this.scoreUrl)URL.revokeObjectURL(this.scoreUrl);this.scoreUrl=this.url(scoreNotes(score,beat,offset),score.end+offset+.3);this.track.src=this.scoreUrl;this.track.muted=this.muted;this.track.currentTime=0;await this.track.play();}
  stop(){this.timers.forEach(clearTimeout);this.timers=[];this.pool.forEach(p=>p.pause());this.track.pause();}
 }
 if(typeof document!=='undefined')ready().catch(()=>{});
 const api={render,scoreNotes,MediaAudio,setSample};root.ShizukuMedia=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis==='undefined'?this:globalThis);
