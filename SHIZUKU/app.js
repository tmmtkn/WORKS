'use strict';
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
let w,h,dpr,started=false,drawing=false,muted=false,abstract=false,audio,master,record=[],origin=0,last=null,playTimer=[],voices=[],playToken=0,focus=0,previous=null,keyboardFocus=false;
// Measured in the original photograph: these are its actual drops, not a grid.
const coords=[[229,82,22],[381,173,43],[498,308,41],[709,394,42],[899,510,42],[1178,664,64],[329,545,65],[154,425,43],[224,514,24],[296,311,23],[504,473,33],[658,633,50],[927,727,37],[318,840,66],[465,945,34],[661,872,42],[1318,923,49],[1432,852,25],[1390,55,42],[1216,205,33],[1104,201,29],[939,118,62],[1111,96,23],[1221,391,29],[1190,316,22],[1348,464,21],[1490,548,20],[1478,292,39],[1277,681,25],[1003,827,28],[531,707,27],[84,692,30],[31,454,20],[377,449,17],[414,455,17],[564,540,15],[281,277,17],[180,594,19],[661,60,26],[1076,38,23],[1336,159,20],[1447,789,17]];
const notes=[0,2,4,7,9,12,14,16,19];
const drops=coords.map(([sx,sy,sr],i)=>({sx,sy,sr,x:0,y:0,r:0,n:notes[(i*5+Math.floor(sy/200))%notes.length],hit:-1e5}));
let sceneScale=1,sceneX=0,sceneY=0,sceneOpacity=.75;
function resize(){w=innerWidth;h=innerHeight;dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);sceneScale=Math.max(w/1536,h/1024);sceneX=(w-1536*sceneScale)/2;sceneY=(h-1024*sceneScale)/2;drops.forEach(d=>{d.x=(sceneX+d.sx*sceneScale)/w;d.y=(sceneY+d.sy*sceneScale)/h;d.r=d.sr*sceneScale});}
addEventListener('resize',resize);resize();
// Safari uses ordinary audio files, independent of the Web Audio output path.
const mediaMode=new URLSearchParams(location.search).get('sound')==='media'||/Safari/.test(navigator.userAgent)&&!/(Chrome|Chromium|CriOS|Edg|OPR)/.test(navigator.userAgent);
const mediaEngine=new ShizukuMedia.MediaAudio($('#nativeTrack'),message=>{$('#audioReport').textContent=message;$('#audioHelp').open=true;});
function audioNow(){return mediaMode?performance.now()/1000:audio.currentTime;}
let analyser,audioSamples;
function audioFailure(){ $('#live').textContent='音を開始できませんでした。下の「音が聞こえないとき」から再生できます。';$('#audioHelp').open=true; }
async function initAudio(){
  if(mediaMode){await mediaEngine.unlock();canvas.dataset.audioState='media-ready';return;}
  if(!audio||audio.state==='closed'){
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Audio unavailable');
    audio=new Audio({latencyHint:'interactive'});master=audio.createGain();master.gain.value=muted?0:.9;
    const comp=audio.createDynamicsCompressor();comp.threshold.value=-16;comp.ratio.value=4;
    analyser=audio.createAnalyser();analyser.fftSize=256;audioSamples=new Float32Array(analyser.fftSize);
    master.connect(comp);comp.connect(analyser);analyser.connect(audio.destination);
    const delay=audio.createDelay(1);delay.delayTime.value=.31;const wet=audio.createGain();wet.gain.value=.17;master.connect(delay);delay.connect(wet);wet.connect(comp);
    audio.onstatechange=()=>{canvas.dataset.audioState=audio.state;if(audio.state==='interrupted'||audio.state==='suspended')$('#live').textContent='音が一時停止しています。「音を確かめる」で再開できます。';};
  }
  // Request resumption inside the original user gesture, before any await.
  const resumed=audio.resume();
  const unlock=audio.createBufferSource();unlock.buffer=audio.createBuffer(1,1,audio.sampleRate);unlock.connect(audio.destination);unlock.start();
  await resumed;
  canvas.dataset.audioState=audio.state;
  if(audio.state!=='running')throw new Error('Audio suspended');
  $('#live').textContent='';
}
function confirmation(){if(mediaMode){mediaEngine.confirm().catch(audioFailure);return;}const t=audio.currentTime+.03;[60,67,74].forEach((n,i)=>tone(n,t+i*.13,1.3,.13));}
async function testSound(){if(mediaMode){cancelPlayback();muted=false;updateSoundButton();await mediaEngine.confirm();return;}muted=false;updateSoundButton();await initAudio();master.gain.setTargetAtTime(.9,audio.currentTime,.03);confirmation();}
function updateSoundButton(){$('#sound').innerHTML=muted?'音なし <span>◖×</span>':'音あり <span>◖))</span>';$('#sound').setAttribute('aria-pressed',muted);$('#sound').setAttribute('aria-label',muted?'音を出す':'音を消す');}
function tone(midi,time,duration=1.8,level=.12){if(mediaMode){if(!document.body.classList.contains('playing'))mediaEngine.note(midi,Math.max(0,time-audioNow()),duration,level);return;}if(!audio)return;const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.value=440*Math.pow(2,(midi-69)/12);g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(level*.78*Math.pow(.92,Math.max(0,midi-69)/3),time+.09);g.gain.exponentialRampToValueAtTime(.0001,time+duration);o.connect(g);g.connect(master);o.start(time);o.stop(time+duration+.05);voices.push(o);o.onended=()=>{o.disconnect();g.disconnect();voices=voices.filter(v=>v!==o)}}
const music=ShizukuMusic;
let liveChordTimes=[];
function chord(d){
  if(!audio&&!mediaMode)return;
  const now=performance.now(),bar=Math.floor((now-origin)/(music.beat*4*1000));
  const pitches=music.dropChord(d,bar),duration=music.beat*3.2;
  // Every touched drop sounds; soften dense overlaps instead of discarding drops.
  liveChordTimes=liveChordTimes.filter(t=>now-t<900);liveChordTimes.push(now);
  const level=.058/Math.sqrt(Math.min(5,liveChordTimes.length));
  if(mediaMode)mediaEngine.cluster(pitches,0,duration,level);
  else pitches.forEach((pitch,k)=>tone(pitch,audioNow()+.01+k*.016,duration,level));
  canvas.dataset.lastChord=pitches.join(',');canvas.dataset.chordsPlayed=String(Number(canvas.dataset.chordsPlayed||0)+1);
}
function setStatus(text){$('#status').textContent=text}
function cancelPlayback(stopVoices=true){if(stopVoices)mediaEngine.stop();playToken++;playTimer.forEach(clearTimeout);playTimer=[];if(stopVoices){voices.forEach(v=>{try{v.stop()}catch{}});voices=[];}document.body.classList.remove('playing')}
async function begin(){await initAudio();confirmation();started=true;document.body.classList.add('started');setStatus('点をなぞり、指を離すと旋律に。');$('#live').textContent='';}
$('#start').onclick=()=>begin().catch(()=>{$('#live').textContent='音を開始できませんでした。もう一度お試しください。'});
function hit(i){if(last===i)return;const now=performance.now();last=i;drops[i].hit=now;record.push({i,at:now,t:(now-origin)/1000});chord(drops[i]);$('#count').textContent=String(record.length).padStart(2,'0')+' / DROPS';$('#clear').disabled=false;$('#finish').disabled=false;setStatus('なぞった道が、音になる。')}
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return {distance:Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy),t}}
function trace(e){const b={x:e.clientX,y:e.clientY},a=previous||b;drops.map((d,i)=>({i,...distance({x:d.x*w,y:d.y*h},a,b)})).filter(d=>d.distance<Math.max(15,drops[d.i].r*.9)).sort((a,b)=>a.t-b.t).forEach(d=>hit(d.i));previous=b;}
canvas.onpointerdown=e=>{if(!started)return;keyboardFocus=false;cancelPlayback();drawing=true;record=[];last=null;previous=null;origin=performance.now();liveChordTimes=[];canvas.dataset.chordsPlayed='0';canvas.setPointerCapture(e.pointerId);$('#replay').disabled=true;initAudio().catch(audioFailure);trace(e)};
canvas.onpointermove=e=>{if(drawing)trace(e)};
async function requestPlayback(){if(mediaMode){if(!drawing)play().catch(audioFailure);return;}const token=playToken;try{await initAudio();if(token===playToken&&!drawing)play();}catch{audioFailure();$('#replay').disabled=false;}}
function finish(){if(!drawing)return;drawing=false;previous=null;if(record.length)requestPlayback();else setStatus('光る雫を押しながら、なぞってみてください。');}
canvas.onpointerup=finish;canvas.onpointercancel=finish;canvas.onlostpointercapture=finish;
async function play(){
  if(!record.length)return;
  cancelPlayback(false);const token=playToken,score=music.compose(record,drops),offset=.45;
  if(mediaMode){$('#nativeTrack').hidden=false;$('#trackLabel').hidden=false;try{await mediaEngine.score(score,music.beat,offset);}catch{audioFailure();$('#audioHelp').open=true;$('#audioReport').textContent='下の再生ボタンから旋律を再生できます。';return;}if(token!==playToken){mediaEngine.stop();return;}}
  const base=audioNow()+offset;
  canvas.dataset.musicPhase='melody';canvas.dataset.melodyNotes=String(score.events.filter(e=>!e.ending).length);canvas.dataset.endingNotes='4';
  document.body.classList.add('playing');setStatus('辿った道が、旋律になる。');$('#replay').disabled=true;$('#finish').disabled=true;
  $('#count').textContent='00 / '+String(score.events.length).padStart(2,'0');
  score.bars.forEach(bar=>{
    bar.notes.forEach((n,k)=>tone(n,base+bar.at+k*.045,music.beat*4,.035));
    [0,2,1,3].forEach((n,k)=>tone(bar.notes[n]+12,base+bar.at+k*music.beat,music.beat*1.6,.028));
  });
  score.events.forEach((e,k)=>{
    tone(e.pitch,base+e.at,e.duration,.16);
    playTimer.push(setTimeout(()=>{if(token!==playToken)return;drops[e.i].hit=performance.now();if(e.ending){canvas.dataset.musicPhase='ending';setStatus('最後のひと節。');}$('#count').textContent=String(k+1).padStart(2,'0')+' / '+String(score.events.length).padStart(2,'0');},(offset+e.at)*1000));
  });
  playTimer.push(setTimeout(()=>{if(token!==playToken)return;document.body.classList.remove('playing');canvas.dataset.musicPhase='complete';$('#replay').disabled=false;setStatus('ひとつの曲が、生まれました。');},(offset+score.end+.35)*1000));
}
$('#finish').onclick=()=>{if(drawing)finish();else requestPlayback();};
$('#replay').onclick=()=>requestPlayback();$('#clear').onclick=()=>{cancelPlayback();record=[];last=null;drops.forEach(d=>d.hit=-1e5);$('#count').textContent='00 / DROPS';$('#replay').disabled=true;$('#clear').disabled=true;$('#finish').disabled=true;setStatus('点をなぞり、指を離すと旋律に。')};
$('#view').onclick=()=>{abstract=!abstract;document.body.classList.toggle('abstract',abstract);$('#view').setAttribute('aria-pressed',abstract);$('#view').textContent=abstract?'点 / 葉':'葉 / 点'};
$('#sound').onclick=()=>{if(mediaMode){muted=!muted;mediaEngine.setMuted(muted);updateSoundButton();return;}if(muted||!audio||audio.state!=='running'){testSound().catch(audioFailure);return;}muted=true;master.gain.setTargetAtTime(0,audio.currentTime,.05);updateSoundButton();};
$('#testSound').onclick=()=>testSound().catch(audioFailure);
canvas.onkeydown=async e=>{if(!started)return;keyboardFocus=true;if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp',' ','Enter','Escape'].includes(e.key))e.preventDefault();if(e.key.startsWith('Arrow'))focus=(focus+(['ArrowRight','ArrowDown'].includes(e.key)?1:drops.length-1))%drops.length;if(e.key===' '){await initAudio();if(!drawing){cancelPlayback();record=[];origin=performance.now();liveChordTimes=[];canvas.dataset.chordsPlayed='0';last=null;drawing=true}last=null;hit(focus)}if(e.key==='Enter'){if(drawing)finish();else requestPlayback();}if(e.key==='Escape')$('#clear').click()};
// In the leaf view the photograph itself is the instrument. During playback,
// feathered samples of those same drops remain as the leaf fades away.
const leafImage=new Image();leafImage.src='assets/leaf.png';
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const sprites=[];let lastFrame=0;
leafImage.onload=()=>drops.forEach((d,i)=>{
  const tile=document.createElement('canvas');tile.width=tile.height=192;const g=tile.getContext('2d'),rr=d.sr*1.16;
  g.drawImage(leafImage,d.sx-rr,d.sy-rr,rr*2,rr*2,0,0,192,192);
  g.globalCompositeOperation='destination-in';const mask=g.createRadialGradient(96,96,56,96,96,96);mask.addColorStop(0,'rgba(0,0,0,1)');mask.addColorStop(.68,'rgba(0,0,0,.98)');mask.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=mask;g.fillRect(0,0,192,192);sprites[i]=tile;
});
// Source-image coordinates keep the wet light attached to the photographed leaf.
// The main vein and its lateral branches are traced once, never regenerated per frame.
const veinNodes=ShizukuVeins.nodes;
function measuredCurve(points){const lengths=[0];for(let k=1;k<points.length;k++)lengths.push(lengths[k-1]+Math.hypot(points[k][0]-points[k-1][0],points[k][1]-points[k-1][1]));return {points,lengths,len:lengths.at(-1)};}
const veinEdges=ShizukuVeins.links.map(([a,b],i)=>({a,b,...measuredCurve(ShizukuVeins.curves[i]),seed:i}));
const veinNeighbors=veinNodes.map(()=>[]);veinEdges.forEach((e,i)=>{veinNeighbors[e.a].push({node:e.b,edge:i});veinNeighbors[e.b].push({node:e.a,edge:i});});
function curvePoint(curve,t){const at=Math.max(0,Math.min(1,t))*curve.len;let k=1;while(k<curve.lengths.length-1&&curve.lengths[k]<at)k++;const a=curve.points[k-1],b=curve.points[k],f=(at-curve.lengths[k-1])/(curve.lengths[k]-curve.lengths[k-1]||1);return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f];}
function attachDrop(drop){let best={gap:Infinity};veinEdges.forEach((e,edge)=>{for(let k=1;k<e.points.length;k++){const a=e.points[k-1],b=e.points[k],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((drop.sx-a[0])*dx+(drop.sy-a[1])*dy)/(dx*dx+dy*dy||1))),point=[a[0]+dx*t,a[1]+dy*t],gap=Math.hypot(point[0]-drop.sx,point[1]-drop.sy);if(gap<best.gap)best={gap,edge,k,point,along:e.lengths[k-1]+Math.hypot(dx,dy)*t};}});return best;}
const dropAttachments=drops.map(attachDrop);
function veinDistances(attachment){
 const e=veinEdges[attachment.edge],dist=veinNodes.map(()=>Infinity),previous=veinNodes.map(()=>null),pending=new Set(veinNodes.map((_,i)=>i));dist[e.a]=attachment.along;dist[e.b]=e.len-attachment.along;
 while(pending.size){let at=-1;for(const i of pending)if(at<0||dist[i]<dist[at])at=i;if(at<0||!Number.isFinite(dist[at]))break;pending.delete(at);for(const next of veinNeighbors[at]){const d=dist[at]+veinEdges[next.edge].len;if(d<dist[next.node]){dist[next.node]=d;previous[next.node]={node:at,edge:next.edge};}}}
 return {dist,previous};
}
const veinSearches=dropAttachments.map(veinDistances);
const wetRoutes=drops.map((d,i)=>{
 const attachment=dropAttachments[i],search=veinSearches[i],source=veinEdges[attachment.edge],routes=[];
 veinEdges.forEach((e,k)=>{if(k===attachment.edge)return;const reverse=search.dist[e.b]<search.dist[e.a],distance=Math.min(search.dist[e.a],search.dist[e.b]);if(distance<330)routes.push({...measuredCurve(reverse?e.points.slice().reverse():e.points),distance,seed:k});});
 routes.push({...measuredCurve([attachment.point,...source.points.slice(0,attachment.k).reverse()]),distance:0,seed:attachment.edge},{...measuredCurve([attachment.point,...source.points.slice(attachment.k)]),distance:0,seed:attachment.edge});
 return routes.filter(e=>e.len>1);
});
function wetPoint(edge,t){const p=curvePoint(edge,t);return {x:sceneX+p[0]*sceneScale,y:sceneY+p[1]*sceneScale};}
function ripple(d,i,now){
 const age=(now-d.hit)/1000;if(age<0||age>4.5)return;
 const x=d.x*w,y=d.y*h,r=d.r,breath=(1-Math.exp(-age*8))*Math.exp(-age*1.65);
 ctx.save();ctx.globalCompositeOperation='screen';
 // A broad, faint reflection awakens at the drop; there is no circular outline.
 const halo=ctx.createRadialGradient(x-r*.2,y+r*.25,r*.2,x,y,r*2.8);halo.addColorStop(0,`rgba(211,227,215,${breath*.12})`);halo.addColorStop(.45,`rgba(191,211,199,${breath*.045})`);halo.addColorStop(1,'rgba(180,210,192,0)');ctx.fillStyle=halo;ctx.fillRect(x-r*3,y-r*3,r*6,r*6);
 if(sprites[i]){ctx.globalAlpha=breath*.12;ctx.drawImage(sprites[i],x-r*1.16,y-r*1.16,r*2.32,r*2.32);ctx.globalAlpha=1;}
 for(const edge of wetRoutes[i]){
  const len=edge.len,steps=Math.max(2,Math.ceil(len/12));
  // The light follows connected veins, splitting and losing energy with distance.
  const distanceFade=Math.exp(-edge.distance/240),travel=reducedMotion?10000:age*185;
  for(let j=0;j<steps;j++){
   const t=j/steps,arrived=(travel-edge.distance-len*t)/185;if(arrived<0)continue;
   const local=reducedMotion?breath:(1-Math.exp(-arrived*9))*Math.exp(-arrived*2.5),alpha=local*distanceFade;
   if(alpha<.008)continue;const p=wetPoint(edge,t),q=wetPoint(edge,(j+1)/steps);
   // Feathered widths catch light like a wet surface, not a neon wire.
   ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
   ctx.strokeStyle=`rgba(188,211,195,${alpha*.145})`;ctx.lineWidth=Math.max(3,8*sceneScale);ctx.shadowBlur=7;ctx.shadowColor=`rgba(186,212,196,${alpha*.22})`;ctx.stroke();
   ctx.shadowBlur=0;ctx.strokeStyle=`rgba(220,233,222,${alpha*.56})`;ctx.lineWidth=Math.max(.4,1.05*sceneScale);ctx.stroke();
  }
 }
 ctx.restore();
}
function draw(now){
  requestAnimationFrame(draw);if(now-lastFrame<30)return;lastFrame=now;ctx.clearRect(0,0,w,h);if(analyser){analyser.getFloatTimeDomainData(audioSamples);canvas.dataset.audioLevel=String(Math.sqrt(audioSamples.reduce((sum,x)=>sum+x*x,0)/audioSamples.length));}
  const playing=document.body.classList.contains('playing'),target=abstract?.035:playing?.09:.75;sceneOpacity+=(target-sceneOpacity)*.045;
  drops.forEach((d,i)=>{if(!sprites[i])return;const r=d.r*1.16;ctx.globalAlpha=Math.max(0,.75-sceneOpacity);ctx.drawImage(sprites[i],d.x*w-r,d.y*h-r,r*2,r*2)});ctx.globalAlpha=1;
  drops.forEach((d,i)=>{ripple(d,i,now);if(keyboardFocus&&document.activeElement===canvas&&focus===i){ctx.strokeStyle='rgba(230,238,230,.35)';ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(d.x*w,d.y*h,d.r+7,d.r*.85+7,0,0,Math.PI*2);ctx.stroke()}});
}
requestAnimationFrame(draw);

$("#nativeCheck").addEventListener("playing",()=>{$("#audioReport").textContent="確認音を再生中です。";});
