'use strict';
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
let w,h,dpr,started=false,drawing=false,muted=false,abstract=false,audio,master,record=[],origin=0,last=null,playTimer=[],voices=[],playToken=0,focus=0,previous=null,keyboardFocus=false;
// Measured in the original photograph: these are its actual drops, not a grid.
const coords=[[229,82,22],[381,173,43],[498,308,41],[709,394,42],[899,510,42],[1178,664,64],[329,545,65],[154,425,43],[224,514,24],[296,311,23],[504,473,33],[658,633,50],[927,727,37],[318,840,66],[465,945,34],[661,872,42],[1318,923,49],[1432,852,25],[1390,55,42],[1216,205,33],[1104,201,29],[939,118,62],[1111,96,23],[1221,391,29],[1190,316,22],[1348,464,21],[1490,548,20],[1478,292,39],[1277,681,25],[1003,827,28],[531,707,27],[84,692,30],[31,454,20],[377,449,17],[414,455,17],[564,540,15],[281,277,17],[180,594,19],[661,60,26],[1076,38,23],[1336,159,20],[1447,789,17]];
const notes=[0,2,4,7,9,12,14,16,19];
const drops=coords.map(([sx,sy,sr],i)=>({sx,sy,sr,x:0,y:0,r:0,n:notes[(i*5+Math.floor(sy/200))%notes.length],hit:-1e5}));
let sceneScale=1,sceneX=0,sceneY=0,connections=[],sceneOpacity=.75;
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
function cancelPlayback(stopVoices=true){if(stopVoices)mediaEngine.stop();connections=[];playToken++;playTimer.forEach(clearTimeout);playTimer=[];if(stopVoices){voices.forEach(v=>{try{v.stop()}catch{}});voices=[];}document.body.classList.remove('playing')}
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
  const base=audioNow()+offset,visualStart=performance.now()+offset*1000;
  canvas.dataset.musicPhase='melody';canvas.dataset.melodyNotes=String(score.events.filter(e=>!e.ending).length);canvas.dataset.endingNotes='4';
  document.body.classList.add('playing');setStatus('辿った道が、旋律になる。');$('#replay').disabled=true;$('#finish').disabled=true;
  $('#count').textContent='00 / '+String(score.events.length).padStart(2,'0');
  connections=score.events.slice(1).map((e,k)=>({a:score.events[k].i,b:e.i,start:visualStart+score.events[k].at*1000,duration:Math.max(480,(e.at-score.events[k].at)*1000),seed:k*2.399}));
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
function ripple(d,i,now){
  const age=(now-d.hit)/1000;if(age<0||age>3.4)return;
  const x=d.x*w,y=d.y*h,r=d.r,seed=i*2.399;
  ctx.save();ctx.translate(x,y);
  if(sprites[i]){const wobble=reducedMotion?0:Math.sin(age*13)*Math.exp(-age*2)*.035;ctx.save();ctx.scale(1+wobble,1-wobble);ctx.globalAlpha=Math.exp(-age*1.4)*.28;ctx.drawImage(sprites[i],-r*1.16,-r*1.16,r*2.32,r*2.32);ctx.restore()}
  if(!reducedMotion)for(let wave=0;wave<3;wave++){
    const t=age-wave*.19;if(t<0||t>2.7)continue;const radius=r+Math.sqrt(t)*38,fade=Math.pow(1-t/2.7,2);
    for(let arc=0;arc<4;arc++){
      ctx.beginPath();const start=seed+arc*1.61;
      for(let step=0;step<=28;step++){const a=start+step/28*(.7+.22*Math.sin(seed+arc)),rr=radius+Math.sin(a*4+seed-t*2)*2.2+Math.sin(a*7-seed)*.8;const px=Math.cos(a)*rr,py=Math.sin(a)*rr*(.74+.03*Math.sin(seed));step?ctx.lineTo(px,py):ctx.moveTo(px,py)}
      ctx.strokeStyle=`rgba(222,232,224,${fade*(.25-wave*.04)})`;ctx.lineWidth=.55+fade*.5;ctx.stroke();
    }
  }
  ctx.restore();
}
function streamPoint(a,b,t,seed,now,branch=0){
  const ax=a.x*w,ay=a.y*h,bx=b.x*w,by=b.y*h,dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1;
  const envelope=Math.sin(Math.PI*t),bend=Math.sin(seed+1.4)*Math.min(65,len*.24);
  // Smooth branching flow: displacement vanishes at both drop surfaces.
  const drift=envelope*(bend+Math.sin(t*5.5+seed)*len*.065+Math.sin(t*11-seed+now*.0008)*3+branch*Math.sin(t*8+seed)*8);
  return {x:ax+dx*t-dy/len*drift,y:ay+dy*t+dx/len*drift};
}
function stream(edge,now){
  const age=now-edge.start;if(age<0||age>edge.duration+3800)return;
  const progress=reducedMotion?1:Math.min(1,age/edge.duration),fade=Math.pow(1-Math.max(0,age-edge.duration)/3800,1.6),a=drops[edge.a],b=drops[edge.b];
  ctx.save();ctx.lineCap='round';
  for(let layer=0;layer<3;layer++){
    ctx.beginPath();for(let j=0;j<=70;j++){const t=progress*j/70,p=streamPoint(a,b,t,edge.seed,now,layer===2?1:0);j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y)}
    ctx.strokeStyle=`rgba(221,235,225,${fade*[.065,.42,.14][layer]})`;ctx.lineWidth=[7,.8,.5][layer];ctx.shadowColor='rgba(208,227,214,.2)';ctx.shadowBlur=layer===0?10:0;ctx.stroke();
  }
  if(progress<1&&!reducedMotion){const p=streamPoint(a,b,progress,edge.seed,now);const glow=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,10);glow.addColorStop(0,'rgba(240,248,239,.55)');glow.addColorStop(1,'rgba(210,230,215,0)');ctx.fillStyle=glow;ctx.fillRect(p.x-10,p.y-10,20,20)}
  ctx.restore();
}
function draw(now){
  requestAnimationFrame(draw);if(now-lastFrame<30)return;lastFrame=now;ctx.clearRect(0,0,w,h);if(analyser){analyser.getFloatTimeDomainData(audioSamples);canvas.dataset.audioLevel=String(Math.sqrt(audioSamples.reduce((sum,x)=>sum+x*x,0)/audioSamples.length));}
  const playing=document.body.classList.contains('playing'),target=abstract?.035:playing?.09:.75;sceneOpacity+=(target-sceneOpacity)*.045;
  drops.forEach((d,i)=>{if(!sprites[i])return;const r=d.r*1.16;ctx.globalAlpha=Math.max(0,.75-sceneOpacity);ctx.drawImage(sprites[i],d.x*w-r,d.y*h-r,r*2,r*2)});ctx.globalAlpha=1;
  if(playing)connections.forEach(e=>stream(e,now));
  if(drawing)record.forEach((e,k)=>{if(k)stream({a:record[k-1].i,b:e.i,start:e.at-500,duration:500,seed:k*2.399},now)});
  drops.forEach((d,i)=>{ripple(d,i,now);if(keyboardFocus&&document.activeElement===canvas&&focus===i){ctx.strokeStyle='rgba(230,238,230,.35)';ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(d.x*w,d.y*h,d.r+7,d.r*.85+7,0,0,Math.PI*2);ctx.stroke()}});
}
requestAnimationFrame(draw);

$("#nativeCheck").addEventListener("playing",()=>{$("#audioReport").textContent="確認音を再生中です。";});
