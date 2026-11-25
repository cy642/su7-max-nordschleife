import * as T from 'three';
import {carModel,setupStage,sample,curvature,section,place,LENGTH,STEP,mapPoints,trackPosts} from './scene.js';
import {createContacts,footprint} from './contact.mjs';
import {driveCar} from './driving.mjs';
import modelBytes from './model-data.js';
const $=id=>document.getElementById(id),clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
const touchDevice=matchMedia('(any-pointer: coarse)').matches||navigator.maxTouchPoints>0;
if(touchDevice)document.documentElement.classList.add('touch-device');
const graphicsProfiles={
 smooth:{dpr:1,minScale:.65,maxScale:.86,pixels:1400000,detailDistance:20},
 balanced:{dpr:1.65,minScale:.72,maxScale:1,pixels:2750000,detailDistance:38},
 high:{dpr:2.4,minScale:.80,maxScale:1,pixels:4800000,detailDistance:65}
};
let quality='balanced';
try{
 const saved=localStorage.getItem('nordrun.quality');
 if(Object.hasOwn(graphicsProfiles,saved))quality=saved;
 else if(localStorage.getItem('nordrun.smooth')==='on')quality='smooth';
}catch{}
function displayRatio(){
 const profile=graphicsProfiles[quality],area=Math.max(1,app.clientWidth*app.clientHeight);
 return Math.min(window.devicePixelRatio||1,profile.dpr,Math.sqrt(profile.pixels/area))*pixelScale;
}
const buttons=[...document.querySelectorAll('[data-mode]')],inputs={gas:false,brake:false,handbrake:false,steerAxis:0};
const carNames=['M. Weber','A. Vogel','L. Fischer','K. Hartmann','J. Roth'];
let smoothLane=0,viewPitch=0,viewYaw=0,smoothFov=54,pixelScale=1,pressureTime=0,recoveryTime=0;
const PHYSICS_DT=1/100;
let resolveContacts;
const damp=(a,b,rate,dt)=>lerp(a,b,-Math.expm1(-rate*dt));
function turnToward(a,b,rate,dt){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*(-Math.expm1(-rate*dt));}
const poseKeys=['s','v','lane','h','steer','roll','pitch'];
function remember(car){const prev=car.previous??={};for(const key of poseKeys)prev[key]=car[key]||0;}
function present(car,alpha){const out=car.presentation??={};for(const key of poseKeys)out[key]=lerp(car.previous?.[key]??(car[key]||0),car[key]||0,alpha);return out;}
const colors=[0xf2b661,0xd15c48,0x91b4a2,0xd0d8df,0x5d7191];
const distances={sprint:3200,full:LENGTH};
const practiceRoutes={
 carousel:{start:12550,end:13800}, garden:{start:15600,end:17300}, finale:{start:18700,end:LENGTH}
};
const paceSettings={
 club:{top:59,grip:10,drive:6.3,brake:9},
 sport:{top:69,grip:13.3,drive:9.0,brake:12.2},
 expert:{top:73.5,grip:16.0,drive:11.4,brake:14.0}
};
let eventType='race',difficulty='sport',sector='carousel',startDistance=0;
let splits=[],previousSplits=[];
const carPool=[];
function timeString(t){
 const ticks=Math.round(t*100);
 return Math.floor(ticks/6000)+':'+(ticks%6000/100).toFixed(2).padStart(5,'0');
}
const player={s:-42,lane:-2.45,v:0,h:0,steer:0,finish:null,contact:0};
const rivals=[],carRoot=new T.Group(),eye=new T.PerspectiveCamera(48,1,.12,7500), desired=new T.Vector3(),look=new T.Vector3(),follow=new T.Vector3();
let stage,model,renderer,mode='sprint',state='garage',modeBeforeModal='',total=3200,remaining=3.4,elapsed=0,wingOpen=false,wing=0,viewMode=0,garageAngle=.71,garagePitch=.24,drag=null,camFresh=true,alertText='',alertLife=0,wasOff=false,ready=false,rafTime=0,simAcc=0,uiTick=0;
const gameCanvas=$('view'), app=$('app');
let soundOn=false,ctx,osc,amp,wind,windGain,lowOsc,lowGain,tyreFilter,tyreGain;
function audioInit(){
 if(ctx)return;ctx=new (window.AudioContext||window.webkitAudioContext)();
 osc=ctx.createOscillator();amp=ctx.createGain();osc.type='sine';osc.frequency.value=75;amp.gain.value=0;osc.connect(amp).connect(ctx.destination);osc.start();
 lowOsc=ctx.createOscillator();lowGain=ctx.createGain();lowGain.gain.value=0;lowOsc.type='triangle';lowOsc.connect(lowGain).connect(ctx.destination);lowOsc.start();
 const b=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;
 const src=ctx.createBufferSource();src.buffer=b;src.loop=true;wind=ctx.createBiquadFilter();wind.type='lowpass';windGain=ctx.createGain();windGain.gain.value=0;src.connect(wind).connect(windGain).connect(ctx.destination);src.start();
 tyreFilter=ctx.createBiquadFilter();tyreFilter.type='bandpass';tyreFilter.Q.value=1.3;tyreGain=ctx.createGain();tyreGain.gain.value=0;src.connect(tyreFilter).connect(tyreGain).connect(ctx.destination);
}
function audioUpdate(){
 if(!ctx)return;
 const active=soundOn&&state==='race',t=ctx.currentTime,v=player.v;
 osc.frequency.setTargetAtTime(78+v*7.7,t,.07);lowOsc.frequency.setTargetAtTime(36+v*2.8,t,.08);
 amp.gain.setTargetAtTime(active?(.006+.023*(inputs.gas?1:.3))*Math.min(1,v/5):0,t,.05);
 lowGain.gain.setTargetAtTime(active&&v>1?.009:0,t,.07);
 wind.frequency.setTargetAtTime(340+v*22,t,.15);windGain.gain.setTargetAtTime(active?.09*(v/74)**1.4:0,t,.12);
 const scrub=clamp(Math.abs(player.roll||0)*22+(inputs.handbrake?.68:inputs.brake?.24:0),0,1);
 const abrasive=Math.abs(player.lane)>5.55;
 tyreFilter.frequency.setTargetAtTime(abrasive?520:710+v*5.5,t,.12);
 tyreGain.gain.setTargetAtTime(active?Math.min(v/25,1)*(.013+.085*scrub+(abrasive?.07:0)):0,t,.11);
}
function beep(high=false){if(!soundOn||!ctx)return;let o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime;o.frequency.value=high?980:590;g.gain.setValueAtTime(.05,t);g.gain.exponentialRampToValueAtTime(.001,t+.17);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+.18);}
$('audio').onclick=()=>{try{audioInit();ctx.resume();soundOn=!soundOn;$('audio').setAttribute('aria-pressed',String(soundOn));$('audio').textContent='声音 · '+(soundOn?'开':'关');audioUpdate();}catch{$('audio').textContent='音频不可用';}};
function bind(id,fn){$(id).addEventListener('click',fn);}
const keyMap={KeyW:'gas',ArrowUp:'gas',KeyS:'brake',ArrowDown:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'handbrake'};
const heldKeys=new Set(),fingers=new Map();
const steerPad=$('steerPad'),pedals=[...document.querySelectorAll('[data-key]')];
let steerPointer=null,touchAxis=0;
function syncKeys(){
 const actions=new Set([...heldKeys].map(code=>keyMap[code]));
 for(const pedal of fingers.values())if(pedal)actions.add(pedal.dataset.key);
 inputs.steerAxis=steerPointer===null?Number(actions.has('right'))-Number(actions.has('left')):touchAxis;
 steerPad.style.setProperty('--wheel-pos',(50+42*inputs.steerAxis)+'%');
 steerPad.setAttribute('aria-valuenow',String(Math.round(inputs.steerAxis*100)));
 for(const button of pedals){
   const key=button.dataset.key;inputs[key]=actions.has(key);
   button.classList.toggle('down',inputs[key]);
 }
}
function resetKeys(){heldKeys.clear();fingers.clear();steerPointer=null;touchAxis=0;syncKeys();}
function showWing(){
 for(const id of ['garageWing','raceWing']){$(id).textContent=(id==='raceWing'&&!touchDevice?'R ':'')+'尾翼 · '+(wingOpen?'展开':'收起');$(id).setAttribute('aria-pressed',String(wingOpen));}
}
function changeWing(){if(!ready||!['garage','race','countdown'].includes(state))return;wingOpen=!wingOpen;showWing();}
bind('garageWing',changeWing);bind('raceWing',changeWing);
bind('camera',()=>{viewMode=(viewMode+1)%4;camFresh=true;announce(['追尾视角','远追视角','引擎盖视角','驾驶席视角'][viewMode],1.2);});
function updateGarage(){
 buttons.forEach(b=>{const active=mode===b.dataset.mode;b.classList.toggle('on',active);b.setAttribute('aria-pressed',String(active));});
 $('difficultyField').hidden=eventType!=='race';
 $('courses').hidden=eventType==='practice';$('sectorField').hidden=eventType!=='practice';
 $('eventNote').textContent={race:'德国 · 纽博格林北环 / 6 车竞速',time:'单人计时 / 三段计时点',practice:'指定路段 / 单人练习'}[eventType];
 if(ready)$('startLabel').textContent={race:'开始比赛',time:'开始计时',practice:'练习这段弯道'}[eventType];
}
buttons.forEach(b=>b.onclick=()=>{mode=b.dataset.mode;updateGarage();});
$('event').onchange=e=>{eventType=e.target.value;updateGarage();};
$('sector').onchange=e=>{sector=e.target.value;};
try{const saved=localStorage.getItem('nordrun.difficulty');if(Object.hasOwn(paceSettings,saved))difficulty=saved;}catch{}
$('difficulty').value=difficulty;
$('difficulty').onchange=e=>{difficulty=e.target.value;try{localStorage.setItem('nordrun.difficulty',difficulty);}catch{}};
updateGarage();
function resize(){
 if(!renderer)return;const w=app.clientWidth,h=app.clientHeight;
 renderer.setPixelRatio(displayRatio());renderer.setSize(w,h,false);
 eye.aspect=w/h;eye.updateProjectionMatrix();camFresh=true;
}
window.addEventListener('resize',resize);
function toggleShell(racing){
 for(const id of ['shade','garageInfo','garageFoot'])$(id).hidden=racing;
 $('hud').hidden=!racing;$('pauseBtn').hidden=!racing;app.classList.toggle('racing',racing);
}
function closeDialog(){ $('modal').hidden=true; }
function dialog(title,html,acts){
 $('dialogTitle').textContent=title;$('dialogBody').innerHTML=html;
 ['primary','secondary','tertiary'].forEach((id,i)=>{let b=$(id),a=acts[i];b.hidden=!a;if(a){b.textContent=a[0];b.onclick=a[1];}});
 $('modal').hidden=false;resetKeys();audioUpdate();$('primary').focus({preventScroll:true});
}
function overlayResume(){state=modeBeforeModal;closeDialog();rafTime=0;audioUpdate();}
function help(){
 if(!$('modal').hidden||!ready)return;modeBeforeModal=state;state='help';
 dialog('驾驶操作','<div class="rows"><div>加速 / 刹车<b>W / S　或 ↑ / ↓</b></div><div>左转 / 右转<b>A / D　或 ← / →</b></div><div>手刹<b>空格</b></div><div>尾翼 / 切换视角<b>R / C</b></div><div>暂停 / 继续<b>Esc 或 P</b></div></div><p>入弯前先刹车，弯中轻点方向，出弯再加速。急弯可短按手刹帮车头转入。</p><details><summary>车辆与赛道资料</summary><p>2024 Xiaomi SU7 Max 三维模型由 <a href="https://sketchfab.com/3d-models/2024-xiaomi-su7-max-db30dd1e254243b4ba002c6ce65df052" target="_blank" rel="noopener">Ddiaz Design</a> 制作，依 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a> 使用。海湾蓝材质和可动尾翼改编亦遵循该许可。<a href="https://s1.xiaomiev.com/activity-outer-assets/0328/env/SU7%E5%8F%82%E6%95%B0%E9%85%8D%E7%BD%AE%E8%A1%A8328.pdf" target="_blank" rel="noopener">小米汽车配置表</a>。</p><p>线路据 <a href="https://github.com/maciejb2k/nurburgring-nordschleife-geojson" target="_blank" rel="noopener">maciejb2k 的北环轨迹</a>，按 <a href="https://nuerburgring.de/info/nuerburgring/records/" target="_blank" rel="noopener">赛道官方全圈长度</a> 标定。高程来自 AWS Terrain Tiles。地面、道路设施及操控按游戏尺度近似制作。</p><p>环境摄影与材质来自 <a href="https://polyhaven.com/a/kloppenheim_03" target="_blank" rel="noopener">Poly Haven</a>（Kloppenheim 03、Asphalt Track、Grass Ground），树木由 <a href="https://opengameart.org/content/high-res-tree-textures" target="_blank" rel="noopener">rubberduck</a> 制作，均为 CC0 素材。</p></details>',[['返回',overlayResume]]);
}
bind('help',()=>{
 help();
 if(touchDevice&&state==='help'){
   const rows=$('dialogBody').querySelector('.rows');
   rows.innerHTML='<div>转向<b>左手按住或横滑方向条</b></div><div>转向幅度<b>靠近中间微调，靠近两端打满</b></div><div>加速 / 刹车 / 手刹<b>右手按住踏板</b></div><div>回正<b>松开方向条</b></div>';
 }
});
function recoverCar(){
 const occupied=rivals.map(r=>footprint(sample,r));
 for(let back=0;back<=96;back+=8)for(const lane of [0,-2.8,2.8]){
   const s=player.s-back, box=footprint(sample,{s,lane});
   if(occupied.some(r=>Math.hypot(r.x-box.x,r.z-box.z)<7))continue;
   Object.assign(player,{s,lane,h:0,v:0,slip:0,steer:0,yawRate:0,pitch:0,roll:0,contact:0});
   remember(player);simAcc=0;camFresh=true;overlayResume();announce('已回到赛道');return;
 }
}
function pause(){if(state==='paused'){overlayResume();return;}if(!['race','countdown'].includes(state))return;modeBeforeModal=state;state='paused';dialog('比赛已暂停','<p>'+section(player.s)[1]+'　·　'+timeString(elapsed)+'</p><p><label>画质　<select id="qualityPause" class="quality"></select></label></p>'+(modeBeforeModal==='race'?'<button class="small" id="recover">移回赛道</button>':''),[['继续驾驶',overlayResume],['重新发车',startRace],['返回车库',garage]]);
 if($('recover'))$('recover').onclick=recoverCar;
 const select=$('qualityPause');select.innerHTML=$('qualityGarage').innerHTML;select.value=quality;select.onchange=changeQuality;
}
function changeQuality(event){
 quality=event.target.value;
 $('qualityGarage').value=quality;
 try{localStorage.setItem('nordrun.quality',quality);}catch{}
 if(renderer)applyGraphics();
}
$('qualityGarage').value=quality;$('qualityGarage').onchange=changeQuality;
function applyGraphics(){
 const profile=graphicsProfiles[quality];
 pixelScale=profile.maxScale;pressureTime=0;recoveryTime=0;
 renderer.setPixelRatio(displayRatio());
 for(const r of carPool)r.object.levels[1].distance=profile.detailDistance;
}
bind('pauseBtn',pause);
function garage(){closeDialog();resetKeys();state='garage';toggleShell(false);stage.garage.add(carRoot);carRoot.position.set(0,.015,0);carRoot.rotation.set(0,0,0);eye.clearViewOffset();camFresh=true;audioUpdate();}
function startRace(){
 if(!ready)return;closeDialog();resetKeys();toggleShell(true);const route=eventType==='practice'?practiceRoutes[sector]:{start:0,end:distances[mode]};
 startDistance=route.start;total=route.end;splits=[];previousSplits=[];
 if(eventType==='time'){try{const saved=JSON.parse(localStorage.getItem(bestKey()+'.splits'));if(Array.isArray(saved)&&saved.length===3&&saved.every(Number.isFinite))previousSplits=saved;}catch{}}
 rivals.length=0;
 for(const car of carPool){car.object.visible=eventType==='race';if(car.object.visible)rivals.push(car);}
 state='countdown';remaining=3;elapsed=0;viewMode=0;alertLife=0;wasOff=false;
 Object.assign(player,{s:eventType==='race'?-42:startDistance,lane:eventType==='race'?2.25:0,v:0,h:0,steer:0,roll:0,pitch:0,yawRate:0,slip:0,finish:null,contact:0});stage.world.add(carRoot);stage.sprintFinish.visible=total<LENGTH;
 if(stage.sprintFinish.visible)place(stage.sprintFinish,total,0);
 const posts=trackPosts.map(post=>post.sprintOnly?{...post,s:total}:post);
 resolveContacts=createContacts(sample,STEP,LENGTH,posts);simAcc=0;
 rivals.forEach((r,i)=>Object.assign(r,{s:-(i+1)*7,lane:i%2?2.25:-2.25,targetLane:i%2?2.25:-2.25,v:0,slip:0,h:0,finish:null}));
 for(const car of [player,...rivals])remember(car);
 camFresh=true;eye.clearViewOffset();eye.updateProjectionMatrix();rafTime=0;uiTick=1;showWing();beep();updateHUD();renderFrame(0,1);
}
bind('startBtn',startRace);
function announce(text,life=1){alertText=text;alertLife=life;}
const bestKey=()=>['nordrun.su7.v3',eventType,eventType==='practice'?sector:mode,eventType==='race'?difficulty:'solo'].join('.');
function best(){try{return parseFloat(localStorage.getItem(bestKey()))||0;}catch{return 0;}}
function rank(){
 if(player.finish!==null)return 1+rivals.filter(r=>r.finish!==null&&r.finish<=player.finish).length;
 return 1+rivals.filter(r=>r.finish!==null||r.s>player.s).length;
}
function crossingTime(car,line,dt){
 const fraction=clamp((line-car.previous.s)/Math.max(.0001,car.s-car.previous.s),0,1);
 return elapsed-(1-fraction)*dt;
}
function finish(){
 player.finish=elapsed;const pos=rank(),old=best();state='finished';inputs.gas=false;
 if(!old||elapsed<old){try{localStorage.setItem(bestKey(),String(elapsed));if(eventType==='time')localStorage.setItem(bestKey()+'.splits',JSON.stringify(splits));}catch{}}
 updateHUD();
 const title=eventType==='race'?'冲线！第 '+pos+' 名':eventType==='practice'?'练习段完成':'计时完成';
 const sectors=eventType==='time'?splits.map((t,i)=>'<div>第 '+(i+1)+' 段<b>'+timeString(t-(splits[i-1]||0))+'</b></div>').join(''):'';
 dialog(title,'<div class="rows"><div>赛程<b>'+((total-startDistance)/1000).toFixed(3)+' KM</b></div>'+sectors+'<div>本次用时<b>'+timeString(elapsed)+'</b></div><div>个人最佳<b>'+timeString(Math.min(old||elapsed,elapsed))+'</b></div></div>',[['再跑一次',startRace],['返回车库',garage]]);
}
function aiStep(dt){
 const pace=paceSettings[difficulty];
 rivals.forEach((r,i)=>{
  if(r.finish!==null){r.s+=dt*r.v;r.v=Math.max(0,r.v-1.7*dt);return;}
  const ahead=[...rivals,player].filter(x=>x!==r&&x.s>r.s&&x.s-r.s<30&&Math.abs(x.lane-r.lane)<2.35).sort((a,b)=>a.s-b.s)[0];
  const bend=curvature(r.s+15,17),anticipated=Math.max(Math.abs(bend),Math.abs(curvature(r.s+r.v*1.12,24)),Math.abs(curvature(r.s+r.v*1.85,18)));
  let want=Math.min(pace.top-i*.62,Math.sqrt((pace.grip-i*.18)/(anticipated+.00065)));
  let lane=r.home+Math.sin(r.s*.0033+i)*.64+clamp(bend*35,-.65,.65);
  if(ahead){const option=ahead.lane>0?-2.6:2.6;
   if(![...rivals,player].some(x=>x!==r&&Math.abs(x.s-r.s)<7&&Math.abs(x.lane-option)<1.9))lane=option;
   if(ahead.s-r.s<7&&Math.abs(ahead.lane-r.lane)<1.9)want=Math.min(want,Math.max(1,ahead.v-1.7));}
  r.slip=damp(r.slip||0,clamp((lane-r.lane)*1.55,-2.4,2.4),4.0,dt);
  r.lane+=r.slip*dt;r.h=damp(r.h||0,Math.atan2(r.slip,Math.max(8,r.v)),5,dt);
  r.v+=clamp(want-r.v,-pace.brake*dt,(pace.drive-i*.19)*(1-r.v/108)*dt);r.s+=r.v*dt;
 });
}
function step(dt){
 remember(player);for(const rival of rivals)remember(rival);
 wing=damp(wing,wingOpen?1:0,4.2,dt);
 if(state==='countdown'){let prev=Math.ceil(remaining);remaining=Math.max(0,remaining-dt);if(Math.ceil(remaining)!==prev)beep(remaining===0);if(remaining===0){state='race';announce('发车',1.05);}return;}
 if(state!=='race')return;
 // Every event uses a standing start and times from the green light.
 elapsed+=dt;alertLife=Math.max(0,alertLife-dt);player.contact=Math.max(0,player.contact-dt);
 const p=player,road=sample(p.s);
 const grass=driveCar(p,inputs,road.grade,curvature(p.s,12),wing,dt);
 if(grass&&!wasOff&&p.v>8)announce('驶上草地',.85);wasOff=grass;
 aiStep(dt);
 const hit=resolveContacts([p,...rivals],stage.sprintFinish.visible);
 if(hit.wall)p.h=damp(p.h,0,12,dt);
 if(!p.contact&&(hit.touched||hit.wall)){p.contact=.8;announce(hit.touched?'车身接触':'擦碰护栏',.75);}
 for(const r of rivals)if(r.finish===null&&r.s>=total)r.finish=crossingTime(r,total,dt);
 if(eventType==='time'&&splits.length<3){
   const mark=total*(splits.length+1)/3;
   if(p.s>=mark){
     const stamp=crossingTime(p,mark,dt),reference=previousSplits[splits.length];
     splits.push(stamp);
     if(splits.length<3)announce('计时点 '+splits.length+' / 3　'+(reference===undefined?timeString(stamp):((stamp>=reference?'+':'−')+Math.abs(stamp-reference).toFixed(2)+' 秒')),2.4);
   }
 }
 if(p.s>=total){elapsed=crossingTime(p,total,dt);finish();}
}
let minX=Infinity,minZ=Infinity,maxX=-Infinity,maxZ=-Infinity;
for(const [x,z] of mapPoints){minX=Math.min(x,minX);maxX=Math.max(x,maxX);minZ=Math.min(z,minZ);maxZ=Math.max(z,maxZ);}
function drawMap(){
 const c=$('mini').getContext('2d'),w=c.canvas.width,h=c.canvas.height,k=Math.min((w-20)/(maxX-minX),(h-12)/(maxZ-minZ));
 const pt=(x,z)=>[(x-(minX+maxX)/2)*k+w/2,(z-(minZ+maxZ)/2)*k+h/2];c.clearRect(0,0,w,h);c.lineJoin='round';
 c.beginPath();mapPoints.forEach(([x,z],i)=>{const p=pt(x,z);if(i)c.lineTo(...p);else c.moveTo(...p);});c.closePath();c.strokeStyle='#789196';c.lineWidth=2.7;c.stroke();
 if(total-startDistance<LENGTH){c.beginPath();for(let s=startDistance;s<total+28;s+=28){const p=sample(Math.min(s,total)),v=pt(p.x,p.z);if(s>startDistance)c.lineTo(...v);else c.moveTo(...v);}c.strokeStyle='#74e2d9';c.lineWidth=4;c.stroke();}
 for(const r of [...rivals,player]){const p=sample(r.s),pos=pt(p.x,p.z);c.beginPath();c.arc(...pos,r===player?5.5:3.4,0,2*Math.PI);c.fillStyle=r===player?'#80fff2':'#f7ab72';c.fill();if(r===player){c.strokeStyle='#103b46';c.lineWidth=2;c.stroke();}}
}
function cornerHint(){
 if(state!=='race')return '';
 const horizon=clamp(player.v*2.7,65,165);
 for(let ahead=20;ahead<=horizon&&player.s+ahead<total;ahead+=15){
   const bend=curvature(player.s+ahead,20),k=Math.abs(bend);
   if(k<.009)continue;
   const direction=bend>0?'右':'左';
   return (ahead<40?'入弯':Math.round(ahead/10)*10+' m')+'　'+direction+(k>=.019?'急弯':'弯');
 }
 return '';
}
function updateHUD(){
 $('metricLabel').textContent=eventType==='race'?'排名 / POS':eventType==='time'?'计时点 / SPLIT':'练习 / SECTOR';
 $('position').textContent=eventType==='race'?rank()+'/6':eventType==='time'?Math.min(splits.length+1,3)+'/3':Math.round(clamp((player.s-startDistance)/(total-startDistance),0,1)*100)+'%';$('clock').textContent=timeString(elapsed);$('remain').textContent=(Math.max(0,total-Math.max(startDistance,player.s))/1000).toFixed(2);
 const braking=inputs.brake||inputs.handbrake;
 $('speed').textContent=Math.round(player.v*3.6);$('power').style.width=(braking?100:inputs.gas?clamp(100-player.v*.48,35,100):9)+'%';$('power').style.background=braking?'#ff956d':'var(--aqua)';
 $('progress').style.width=clamp((player.s-startDistance)/(total-startDistance)*100,0,100)+'%';
 const sc=section(Math.max(0,player.s));$('sectionName').textContent=sc[1];$('sectionCn').textContent=sc[2];
 const hint=cornerHint();$('cornerHint').hidden=!hint;$('cornerHint').textContent=hint;
 $('count').textContent=state==='countdown'?Math.ceil(remaining):'';
 $('alert').hidden=alertLife<=0;$('alert').textContent=alertText;drawMap();
}
function renderFrame(dt,alpha=1){
 const inGarage=state==='garage'||state==='help'&&modeBeforeModal==='garage',portrait=eye.aspect<1;
 if(inGarage)wing=damp(wing,wingOpen?1:0,4.2,dt);
 model.updateWing(wing);
 const car=present(player,alpha);
 model.cockpit(!inGarage&&viewMode===3);
 model.suspension(inGarage?0:car.pitch,inGarage?0:car.roll);
 model.drive(inGarage?0:car.v,inGarage?0:car.steer,state==='race'&&(inputs.brake||inputs.handbrake),state==='race'?dt:0);
 if(inGarage){
  const w=app.clientWidth,h=app.clientHeight;
  const distance=portrait?Math.max(7.0,7.25/eye.aspect):Math.max(6.6,9.5/eye.aspect);
  eye.fov=36;eye.setViewOffset(w,h,portrait?0:-w*.135,portrait?h*.205:0,w,h);
  eye.position.set(Math.sin(garageAngle)*distance, .55+distance*Math.sin(garagePitch),Math.cos(garageAngle)*distance);eye.lookAt(0,.61,0);
  renderer.render(stage.garage,eye);return;
 }
 const road=place(carRoot,car.s,car.lane,.018,car.h);
 for(const r of rivals){const ai=present(r,alpha);place(r.object,ai.s,ai.lane,.016,ai.h);r.object.visible=r.object.position.distanceToSquared(carRoot.position)<700*700;}
 const camDistance=viewMode===1?10.5:6.9;
 const rear=sample(car.s-8),lead=sample(car.s+13+car.v*.085);
 const heading=Math.atan2(lead.x-rear.x,lead.z-rear.z)-car.h*(viewMode===2?.55:.16);
 const slope=Math.atan2(lead.y-rear.y,Math.hypot(lead.x-rear.x,lead.z-rear.z));
 viewYaw=camFresh?heading:turnToward(viewYaw,heading,viewMode===2?14:10,dt);
 viewPitch=camFresh?slope:damp(viewPitch,slope,6,dt);
 smoothLane=camFresh?car.lane:damp(smoothLane,car.lane,10,dt);
 const dx=Math.sin(viewYaw),dz=Math.cos(viewYaw);
 if(viewMode===2){
   const yaw=Math.atan2(road.tx,road.tz)-car.h;
   desired.set(carRoot.position.x+Math.sin(yaw)*1.02,road.y+1.18+road.grade,carRoot.position.z+Math.cos(yaw)*1.02);
 }else{
   desired.set(road.x-road.tz*smoothLane-dx*camDistance,road.y+(viewMode===1?4.35:2.61)-Math.tan(viewPitch)*camDistance,road.z+road.tx*smoothLane-dz*camDistance);
 }
 eye.position.copy(desired);const distance=24;
 look.set(desired.x+dx*distance,desired.y+distance*(Math.tan(viewPitch)-(viewMode===2?.032:viewMode===1?.189:.143)),desired.z+dz*distance);
 eye.lookAt(look);
 const fov=(portrait?(viewMode===2?73:75):(viewMode===2?67:54))+car.v*.068;
 smoothFov=camFresh?fov:damp(smoothFov,fov,3.5,dt);camFresh=false;
 eye.fov=smoothFov;eye.far=1450;eye.near=.12;
 if(viewMode===3){
   // Seat and camera share the same car pose so the dash stays still through a bend.
   desired.set(.36,1.185,.27).applyQuaternion(carRoot.quaternion).add(carRoot.position);
   look.set(0,-.072,1).applyQuaternion(carRoot.quaternion).multiplyScalar(18).add(desired);
   eye.position.copy(desired);eye.lookAt(look);eye.fov=portrait?82:68;eye.near=.035;
 }
 eye.updateProjectionMatrix();
 renderer.render(stage.world,eye);
}
function frame(t){
 requestAnimationFrame(frame);if(!ready||document.hidden)return;
 const raw=rafTime?(t-rafTime)/1000:1/60,dt=Math.min(.12,raw);rafTime=t;
 if(['race','countdown'].includes(state)){
   simAcc+=dt;while(simAcc>=PHYSICS_DT){step(PHYSICS_DT);simAcc-=PHYSICS_DT;}
   uiTick+=dt;if(uiTick>.07){updateHUD();audioUpdate();uiTick=0;}
   if(raw>.032){pressureTime+=dt;recoveryTime=0;}else{pressureTime=Math.max(0,pressureTime-dt*.5);recoveryTime=raw<.019?recoveryTime+dt:0;}
   const {minScale,maxScale}=graphicsProfiles[quality];
   if(pressureTime>1.8&&pixelScale>minScale){pixelScale=Math.max(minScale,pixelScale-.12);pressureTime=0;renderer.setPixelRatio(displayRatio());}
   else if(recoveryTime>12&&pixelScale<maxScale){pixelScale=Math.min(maxScale,pixelScale+.065);recoveryTime=0;renderer.setPixelRatio(displayRatio());}
 }
 if(state==='garage')carRoot.visible=true;
 renderFrame(dt,state==='finished'?1:clamp(simAcc/PHYSICS_DT,0,1));
}
window.addEventListener('keydown',e=>{
 if(!ready||e.altKey||e.ctrlKey||e.metaKey)return;
 if(e.code!=='Escape'&&e.target.closest?.('input, select, textarea, [contenteditable=true]'))return;
 const key=keyMap[e.code];if(key&&!$('modal').hidden)return;
 if(key&&['countdown','race'].includes(state)){e.preventDefault();if(!e.repeat){heldKeys.add(e.code);syncKeys();}return;}if(e.repeat)return;
 if(e.code==='KeyR'){changeWing();}else if(e.code==='KeyC'&&state==='race')$('camera').click();
 else if(e.code==='KeyP'||e.code==='Escape'){if(state==='help')overlayResume();else pause();}
 else if(e.code==='Enter'&&state==='garage'&&!e.target.closest('button'))startRace();
});
window.addEventListener('keyup',e=>{if(heldKeys.delete(e.code)){e.preventDefault();syncKeys();}});
function updateTouchSteer(e){
 const rect=steerPad.getBoundingClientRect();
 const x=clamp((e.clientX-rect.left-rect.width/2)/Math.max(1,rect.width*.42),-1,1);
 touchAxis=Math.sign(x)*Math.max(0,Math.abs(x)-.06)/.94;
 syncKeys();
}
steerPad.addEventListener('pointerdown',e=>{
 if(!['countdown','race'].includes(state)||steerPointer!==null||e.button!==0)return;
 e.preventDefault();steerPointer=e.pointerId;steerPad.setPointerCapture(e.pointerId);updateTouchSteer(e);
});
steerPad.addEventListener('pointermove',e=>{if(steerPointer===e.pointerId)updateTouchSteer(e);});
for(const event of ['pointerup','pointercancel','lostpointercapture']){
 steerPad.addEventListener(event,e=>{if(steerPointer===e.pointerId){steerPointer=null;touchAxis=0;syncKeys();}});
}
steerPad.addEventListener('contextmenu',e=>e.preventDefault());
for(const b of pedals){
 b.addEventListener('pointerdown',e=>{
   if(!['countdown','race'].includes(state)||e.button!==0)return;
   e.preventDefault();b.setPointerCapture(e.pointerId);fingers.set(e.pointerId,b);syncKeys();
 });
 b.addEventListener('pointermove',e=>{
   if(!fingers.has(e.pointerId))return;
   const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-key]');
   fingers.set(e.pointerId,target?.parentElement===b.parentElement?target:null);syncKeys();
 });
 const release=e=>{fingers.delete(e.pointerId);syncKeys();};
 for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,release);
 b.addEventListener('contextmenu',e=>e.preventDefault());
}
if(touchDevice)$('camera').textContent='视角';
window.nordBack=()=>{
 if(state==='help'||state==='paused'){overlayResume();return true;}
 if(state==='race'||state==='countdown'){pause();return true;}
 if(state==='finished'){garage();return true;}
 return false;
};
gameCanvas.addEventListener('pointerdown',e=>{if(state!=='garage')return;drag={x:e.clientX,y:e.clientY};gameCanvas.setPointerCapture(e.pointerId);});
gameCanvas.addEventListener('pointermove',e=>{if(!drag)return;garageAngle-=(e.clientX-drag.x)*.009;garagePitch=clamp(garagePitch+(e.clientY-drag.y)*.004,.05,.59);drag={x:e.clientX,y:e.clientY};});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])gameCanvas.addEventListener(ev,()=>drag=null);
document.addEventListener('visibilitychange',()=>{if(document.hidden){resetKeys();if(state==='race'||state==='countdown')pause();}rafTime=0;});window.addEventListener('blur',()=>{resetKeys();if(state==='race'||state==='countdown')pause();});
async function boot(){
 renderer=new T.WebGLRenderer({canvas:gameCanvas,antialias:true,powerPreference:'high-performance'});renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
 resize();[stage,model]=await Promise.all([setupStage(renderer),carModel(modelBytes)]);carRoot.add(model.object);
 model.updateWing(0);
 for(let i=0;i<5;i++){
   const object=new T.LOD();
   object.addLevel(model.makeOpponent(colors[i]),0);
   object.addLevel(model.makeDistant(colors[i]),30,.12);
   stage.world.add(object);
   carPool.push({name:carNames[i],object,home:(i%2?1:-1)*(1.5+.22*i)});
 }
 applyGraphics();stage.garage.add(carRoot);ready=true;$('startBtn').disabled=false;$('startLabel').textContent='开始比赛';showWing();garage();frame(performance.now());
 if(location.search.includes('qa=1'))window.__qa={state:()=>({state,s:player.s,lane:player.lane,heading:player.h,speed:player.v,wing,wingOpen,rank:rank(),total,elapsed,eventType,difficulty,sector,startDistance,splits:[...splits],rivals:rivals.map(r=>({s:r.s,v:r.v,finish:r.finish})),viewMode}),advance:(seconds)=>{for(let i=0;i<seconds/PHYSICS_DT;i++)step(PHYSICS_DT);updateHUD();},info:()=>renderer.info.render,render:()=>renderFrame(1/60)};
}
boot().catch(e=>{console.error(e);$('error').hidden=false;$('error').innerHTML='<p>三维画面未能启动。请用支持 WebGL 的新版 Chrome、Edge 或 Safari 打开，并启用图形加速。</p><button class="small" onclick="location.reload()">重新载入</button>';});
