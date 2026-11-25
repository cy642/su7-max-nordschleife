import {createAirfieldScene,placeOnRunway} from './airfield.js';
import {pursuitPlan,stepPursuitTarget,racingLinePlan,judgeLineGate,MISS_SECONDS} from './club-events.mjs';
import {RUNWAY,runwaySample,newRunwayTrial,stepRunwayTrial} from './airfield-run.mjs';
import {checkpointPlan,speedTraps,speedTrapTarget,crossingFraction,eliminationRounds,recordEliminationCrossings,cutOrder} from './challenges.mjs';
import {paceSettings,rivalProfile,rivalRoad,rivalSpeed,competitionRecordGroup} from './competition.mjs';
import * as T from 'three';
import {carModel,setupStage,place,section,trackPosts} from './scene.js';
import {ROUTES,selectTrack,sample,curvature,LENGTH,STEP} from './track.mjs';
import {createRouteWorlds} from './route-worlds.js';
import {createMap} from './route-map.js';
import {createContacts,footprint} from './contact.mjs';
import {driveCar} from './driving.mjs';
import {newBoost,toggleBoost,endBoost,supportsBoost,BOOST_SECONDS,BOOST_COOLDOWN} from './boost.mjs';
import {createTelemetry,sampleTelemetry,resetTransient} from './test-drive.mjs';
import {testReport} from './test-drive-report.mjs';
import {createTestDriveControls} from './test-drive-controls.js';
import {getVehicle,VEHICLES} from './vehicles.mjs';
import modelBytes from './model-data.js';
const $=id=>document.getElementById(id),clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
function showAppUpdate(info){
 if(!info?.current)return;
 const link=$('appUpdate');
 link.hidden=false;
 link.textContent=info.available?'更新到 '+info.available:'检查更新';
 link.title='当前版本 '+info.current;
 link.classList.toggle('available',Boolean(info.available));
}
window.addEventListener('nordrun-update',event=>showAppUpdate(event.detail));
showAppUpdate(window.nordrunUpdate);
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
const sectorKeys=['carousel','garden','finale']; // Preserve existing Nürburgring record keys.
let routeInfo=ROUTES.nord, mapRoute='',roadMap,worlds,raceScene;
const raceLength=()=>mode==='full'?routeInfo.length:routeInfo.sprint;
let eventType='race',difficulty='sport',sector='carousel',startDistance=0;
let splits=[],previousSplits=[];
let runwayScene,runwayTrial;
const onRunway=()=>eventType==='airfield';
const freeDrive=()=>eventType==='freedrive';
const inTestDrive=()=>freeDrive()||onRunway();
let driveStats=createTelemetry(),demoControls,previewCabin=false;
const challengeBriefs={
 get pursuit(){
   return '对手领先 '+pursuitPlan(vehicle,difficulty).lead+' 米发车。在终点前追上并超过对手。';
 },
 get racingline(){
   const plan=racingLinePlan(raceLength(),difficulty);
   return '按提示速度穿过黄门，蓝门预告下一处。'+plan.gates.length+' 门中至少命中 '+plan.required+' 门，每次失手加 '+MISS_SECONDS+' 秒。';
 },
 checkpoint:'在倒计时归零前过门，每过一门补时，撑到终点。',
 elimination:'两道淘汰线各淘汰末两名，最后两车争冠。',
 speedtrap:'冲过三道测速门，挑战更高的三门平均速度。'
};
const hasRivals=()=>eventType==='race'||eventType==='elimination'||eventType==='pursuit';
let pursuit, racingLine;
let gates=[],gateIndex=0,deadline=0,gateBonuses=[],radarSpeeds=[],radarTarget=0,rounds=[];
function nextGate(){
 if(eventType==='elimination')return rounds.find((round,i)=>i>=gateIndex&&!round.passed.has(player))?.line??total;
 return gates[gateIndex]??total;
}
const carPool=[];
function timeString(t){
 const ticks=Math.round(t*100);
 return Math.floor(ticks/6000)+':'+(ticks%6000/100).toFixed(2).padStart(5,'0');
}
let vehicle=getVehicle('max');
try{vehicle=getVehicle(localStorage.getItem('nordrun.vehicle'));}catch{}
const titleParts={su7:['SU7',''],max:['SU7','Max'],yu7gt:['YU7','GT'],ultra:['SU7','Ultra'],visiongt:['Vision','GT']};
const player={vehicleId:vehicle.id,s:-42,lane:-2.45,v:0,h:0,steer:0,finish:null,contact:0};
const rivals=[],carRoot=new T.Group(),eye=new T.PerspectiveCamera(48,1,.12,7500), desired=new T.Vector3(),look=new T.Vector3(),follow=new T.Vector3();
let stage,model,renderer,mode='sprint',state='garage',modeBeforeModal='',total=3200,remaining=3.4,elapsed=0,wingOpen=false,wing=0,viewMode=0,garageAngle=.71,garagePitch=.24,drag=null,camFresh=true,alertText='',alertLife=0,wasOff=false,ready=false,rafTime=0,simAcc=0,uiTick=0;
const gameCanvas=$('view'), app=$('app');
let boost=newBoost();
function boostStatus(){
 const active=Math.max(0,boost.end-elapsed),cooldown=active?0:Math.max(0,boost.ready-elapsed);
 return {equipped:supportsBoost(vehicle.id),active,cooldown,uses:boost.uses};
}
function paintBoost(){
 const button=$('boostControl'),status=boostStatus();
 button.hidden=!status.equipped;
 if(button.hidden)return;
 const driving=state==='race'&&player.gear===1;
 button.disabled=!driving||status.cooldown>0;
 button.setAttribute('aria-pressed',String(status.active>0));
 button.dataset.phase=status.active?'active':status.cooldown?'cooldown':'ready';
 const fraction=status.active?status.active/BOOST_SECONDS:1-status.cooldown/BOOST_COOLDOWN;
 button.style.setProperty('--charge',(fraction*100).toFixed(1)+'%');
 $('boostReadout').textContent=status.active?'剩 '+Math.ceil(status.active)+'s':status.cooldown?'冷却 '+Math.ceil(status.cooldown)+'s':player.gear===-1?'倒挡':state==='countdown'?'发车后':'就绪';
}
function useBoost(){
 if(state!=='race'||!toggleBoost(boost,elapsed,vehicle.id,player.gear))return;
 paintBoost();beep(boost.end>elapsed);
}
// A second touch may never deliver click while the first thumb is steering.
$('boostControl').addEventListener('pointerdown',e=>{if(e.button===0){e.preventDefault();useBoost();}});
$('boostControl').addEventListener('click',e=>{if(e.detail===0)useBoost();});
const lookDirection=new T.Vector3(0,-.072,1);
let soundOn=false,ctx,osc,amp,wind,windGain,lowOsc,lowGain,tyreFilter,tyreGain,tunnelEcho;
let tunnelCover=0;
function audioInit(){
 if(ctx)return;ctx=new (window.AudioContext||window.webkitAudioContext)();
 osc=ctx.createOscillator();amp=ctx.createGain();osc.type='sine';osc.frequency.value=75;amp.gain.value=0;osc.connect(amp).connect(ctx.destination);osc.start();
 lowOsc=ctx.createOscillator();lowGain=ctx.createGain();lowGain.gain.value=0;lowOsc.type='triangle';lowOsc.connect(lowGain).connect(ctx.destination);lowOsc.start();
 const b=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),a=b.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=Math.random()*2-1;
 const src=ctx.createBufferSource();src.buffer=b;src.loop=true;wind=ctx.createBiquadFilter();wind.type='lowpass';windGain=ctx.createGain();windGain.gain.value=0;src.connect(wind).connect(windGain).connect(ctx.destination);src.start();
 tyreFilter=ctx.createBiquadFilter();tyreFilter.type='bandpass';tyreFilter.Q.value=1.3;tyreGain=ctx.createGain();tyreGain.gain.value=0;src.connect(tyreFilter).connect(tyreGain).connect(ctx.destination);
 const reflection=ctx.createDelay(.2),repeat=ctx.createGain();reflection.delayTime.value=.096;repeat.gain.value=.24;
 tunnelEcho=ctx.createGain();tunnelEcho.gain.value=0;
 amp.connect(reflection);tyreGain.connect(reflection);reflection.connect(repeat).connect(reflection);
 reflection.connect(tunnelEcho).connect(ctx.destination);
}
function brakeLights(){return inputs.handbrake||(player.gear===-1?inputs.gas:inputs.brake);}
function tractionInput(){return player.gear===-1?inputs.brake:inputs.gas;}
function audioUpdate(){
 if(!ctx)return;
 const active=soundOn&&state==='race',t=ctx.currentTime,v=Math.abs(player.v);
 tunnelEcho.gain.setTargetAtTime(active?.43*tunnelCover:0,t,.10);
 osc.frequency.setTargetAtTime(78+v*7.7,t,.07);lowOsc.frequency.setTargetAtTime(36+v*2.8,t,.08);
 amp.gain.setTargetAtTime(active?(.006+.023*(tractionInput()?1:.3))*Math.min(1,v/5):0,t,.05);
 lowGain.gain.setTargetAtTime(active&&v>1?.009:0,t,.07);
 wind.frequency.setTargetAtTime(340+v*22,t,.15);windGain.gain.setTargetAtTime(active?.09*(v/74)**1.4:0,t,.12);
 const scrub=clamp(Math.abs(player.roll||0)*22+(inputs.handbrake?.68:brakeLights()?.24:0),0,1);
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
 const active=vehicle.wing==='active';
 for(const id of ['garageWing','raceWing']){
   const b=$(id);b.disabled=!active;
   b.hidden=id==='raceWing'&&!active;
   b.textContent=active?((id==='raceWing'&&!touchDevice?'R ':'')+'尾翼 · '+(wingOpen?'展开':'收起')):vehicle.aero;
   if(active)b.setAttribute('aria-pressed',String(wingOpen));else b.removeAttribute('aria-pressed');
 }
}
function setCabinPreview(enabled){
 previewCabin=enabled;
 app.classList.toggle('cabinPreview',enabled);$('previewCabin').textContent=enabled?'返回外观':'看座舱';
 $('previewCabin').setAttribute('aria-pressed',String(enabled));drag=null;
}
bind('previewCabin',()=>{if(ready&&state==='garage')setCabinPreview(!previewCabin);});
function changeWing(){if(vehicle.wing!=='active'||!ready||!['garage','race','countdown'].includes(state))return;wingOpen=!wingOpen;showWing();}
function paintVehicleInfo(){
 const [name,trim]=titleParts[vehicle.id];
 $('vehicle').value=vehicle.id;
 $('modelName').textContent=name;$('modelTrim').textContent=trim;
 $('paintName').textContent=vehicle.colorName;$('paintSwatch').style.backgroundColor=vehicle.color;
 $('paintEnglish').textContent=vehicle.concept?'概念展车':vehicle.year+' 款';
 $('vehiclePower').textContent=vehicle.powerKw??'概念车';
 $('vehiclePower').parentElement.querySelector('small').hidden=vehicle.concept===true;
 $('motorLabel').textContent=vehicle.concept?'主动尾流控制':vehicle.drive;
 $('vehicleAccel').textContent=vehicle.zeroTo100.toFixed(2);$('vehicleTopSpeed').textContent=vehicle.topSpeed;
 $('accelLabel').textContent=vehicle.concept?'零百 · 游戏设定':'零百加速';
 $('speedLabel').textContent=vehicle.concept?'极速 · 游戏设定':'最高车速';
 showWing();
}
$('vehicle').onchange=e=>{
 if(state!=='garage'||!Object.hasOwn(VEHICLES,e.target.value))return;
 vehicle=getVehicle(e.target.value);player.vehicleId=vehicle.id;
 wing=0;wingOpen=false;demoControls?.setVehicle(vehicle.id);if(model){model.setVehicle(vehicle.id);model.updateWing(0);}
 camFresh=true;paintVehicleInfo();updateGarage();try{localStorage.setItem('nordrun.vehicle',vehicle.id);}catch{}
};
paintVehicleInfo();
bind('garageWing',changeWing);bind('raceWing',changeWing);
bind('camera',()=>{viewMode=(viewMode+1)%4;camFresh=true;announce(['追尾视角','远追视角','引擎盖视角','驾驶席视角'][viewMode],1.2);});
function updateGarage(){
 if(!ready)return;
 if(mapRoute!==routeInfo.id){
   selectTrack(routeInfo.id);mapRoute=routeInfo.id;roadMap=createMap(routeInfo);
   roadMap.draw($('routeTrace').getContext('2d'),5);
   $('routeTrace').title=routeInfo.name+'路线图，橙色为隧道路段';
   for(const [i,option] of [...$('sector').options].entries()){
     const segment=routeInfo.practice[i];
     option.textContent=segment.name+' · '+((segment.end-segment.start)/1000).toFixed(2)+' km';
   }
   for(const b of buttons)b.querySelector('span').textContent=
     (b.dataset.mode==='full'?routeInfo.length:routeInfo.sprint)/1000+' KM';
 }
 $('route').value=routeInfo.id;$('routeField').hidden=onRunway();
 buttons.forEach(b=>{const active=mode===b.dataset.mode;b.classList.toggle('on',active);b.setAttribute('aria-pressed',String(active));});
 $('difficultyField').hidden=!['race','elimination','checkpoint','speedtrap','pursuit','racingline'].includes(eventType);
 const testDrive=onRunway()||eventType==='freedrive';
 $('testVenue').hidden=!testDrive;$('quickAirfield').hidden=testDrive;
 for(const button of document.querySelectorAll('[data-test-venue]')){const active=button.dataset.testVenue===eventType;button.classList.toggle('on',active);button.setAttribute('aria-pressed',String(active));}
 $('venueName').textContent=onRunway()?'East Apron · 测试跑道':routeInfo.name;
 const brief=onRunway()?'测零百、跑 400 米，再停在 600 米黄框内。':freeDrive()?'沿'+routeInfo.name+'自由驾驶，暂停可查看本次试驾报告。':challengeBriefs[eventType];$('challengeBrief').hidden=!brief;$('challengeBrief').textContent=brief||'';
 if(eventType==='speedtrap'){
   $('challengeBrief').textContent='三道测速门取平均，本次达标线 '+speedTrapTarget(raceLength(),difficulty,vehicle.id)+' km/h。';
 }else if(eventType==='checkpoint'){
   const plan=checkpointPlan(raceLength(),difficulty,vehicle.id);
   $('challengeBrief').textContent='起步有 '+plan.allowance.toFixed(1)+' 秒，每过一门补时。剩余时间可以带入下一段。';
 }
 $('courses').hidden=eventType==='practice'||testDrive;$('sectorField').hidden=eventType!=='practice';
 $('eventNote').textContent={race:'六车竞速 / 同级对抗',pursuit:'双车追击 / 抢先冲线',racingline:'走线训练 / 入弯、弯心、出弯',time:'单人计时 / 三段计时点',practice:'指定路段 / 单人练习',checkpoint:'限时闯关',elimination:'六车发车 / 两车决胜',speedtrap:'测速挑战',airfield:'机场 / 直线加速与精确停车',freedrive:'公路 / 自由试驾'}[eventType];
 if(ready)$('startLabel').textContent={race:'开始比赛',pursuit:'开始追击',racingline:'挑战走线',time:'开始计时',practice:'练习这段弯道',checkpoint:'开始闯关',elimination:'开始淘汰赛',speedtrap:'开始测速',airfield:'开始测试',freedrive:'开始试驾'}[eventType];
}
function saveRaceSetup(){
 try{localStorage.setItem('nordrun.raceSetup',JSON.stringify({eventType,mode,sector,route:routeInfo.id}));}catch{}
}
for(const route of Object.values(ROUTES))$('route').add(new Option(route.name,route.id));
try{
 const saved=JSON.parse(localStorage.getItem('nordrun.raceSetup'));
 if(saved){
   if([...$('event').options].some(option=>option.value===saved.eventType))eventType=saved.eventType;
   if(['sprint','full'].includes(saved.mode))mode=saved.mode;
   if(sectorKeys.includes(saved.sector))sector=saved.sector;
   if(Object.hasOwn(ROUTES,saved.route))routeInfo=ROUTES[saved.route];
   $('event').value=eventType;$('sector').value=sector;
 }
}catch{}
const linkedRoute=new URLSearchParams(location.search);
if(Object.hasOwn(ROUTES,linkedRoute.get('route'))){
 routeInfo=ROUTES[linkedRoute.get('route')];
 if(linkedRoute.get('event')==='practice'){eventType='practice';sector=sectorKeys[0];}
 else if(onRunway())eventType='race';
 $('route').value=routeInfo.id;$('event').value=eventType;$('sector').value=sector;
}
$('route').onchange=e=>{routeInfo=ROUTES[e.target.value];updateGarage();saveRaceSetup();};
buttons.forEach(b=>b.onclick=()=>{mode=b.dataset.mode;saveRaceSetup();updateGarage();});
function selectEvent(value){eventType=value;$('event').value=value;saveRaceSetup();updateGarage();}
$('event').onchange=e=>selectEvent(e.target.value);
bind('quickAirfield',()=>selectEvent('airfield'));
for(const b of document.querySelectorAll('[data-test-venue]'))b.onclick=()=>selectEvent(b.dataset.testVenue);
$('sector').onchange=e=>{sector=e.target.value;saveRaceSetup();};
try{const saved=localStorage.getItem('nordrun.difficulty');if(Object.hasOwn(paceSettings,saved))difficulty=saved;}catch{}
$('difficulty').value=difficulty;
$('difficulty').onchange=e=>{difficulty=e.target.value;try{localStorage.setItem('nordrun.difficulty',difficulty);}catch{}updateGarage();};
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
 dialog('驾驶操作','<div class="rows"><div>加速 / 刹车<b>W / S　或 ↑ / ↓</b></div><div>倒车<b>停稳后继续按住 S 或 ↓</b></div><div>左转 / 右转<b>A / D　或 ← / →</b></div><div>手刹<b>空格</b></div><div>尾翼 / 切换视角<b>R / C</b></div><div>暂停 / 继续<b>Esc 或 P</b></div></div><p>入弯前先刹车，弯中轻点方向，出弯再加速。急弯可短按手刹帮车头转入。</p><details><summary>车辆与赛道资料</summary><p>2024 Xiaomi SU7 Max 三维模型由 <a href="https://sketchfab.com/3d-models/2024-xiaomi-su7-max-db30dd1e254243b4ba002c6ce65df052" target="_blank" rel="noopener">Ddiaz Design</a> 制作，依 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a> 使用。游戏内的 SU7 系列与 YU7 GT 采用车模改编。Vision GT 按概念展车公开照片独立建模，性能为游戏设定。<a href="https://s1.xiaomiev.com/activity-outer-assets/0328/env/SU7%E5%8F%82%E6%95%B0%E9%85%8D%E7%BD%AE%E8%A1%A8328.pdf" target="_blank" rel="noopener">小米汽车配置表</a>。</p><p>线路据 <a href="https://github.com/maciejb2k/nurburgring-nordschleife-geojson" target="_blank" rel="noopener">maciejb2k 的北环轨迹</a>，按 <a href="https://nuerburgring.de/info/nuerburgring/records/" target="_blank" rel="noopener">赛道官方全圈长度</a> 标定。高程来自 AWS Terrain Tiles。地面、道路设施及操控按游戏尺度近似制作。</p><p>环境摄影与材质来自 <a href="https://polyhaven.com/a/kloppenheim_03" target="_blank" rel="noopener">Poly Haven</a>（Kloppenheim 03、Asphalt Track、Grass Ground），树木由 <a href="https://opengameart.org/content/high-res-tree-textures" target="_blank" rel="noopener">rubberduck</a> 制作，均为 CC0 素材。</p></details>',[['返回',overlayResume]]);
}
bind('help',()=>{
 help();
 if(touchDevice&&state==='help'){
   const rows=$('dialogBody').querySelector('.rows');
   rows.innerHTML='<div>转向<b>左手按住或横滑方向条</b></div><div>转向幅度<b>靠近中间微调，靠近两端打满</b></div><div>加速 / 刹车 / 手刹<b>右手按住踏板</b></div><div>倒车<b>停稳后继续按住刹车</b></div><div>回正<b>松开方向条</b></div>';
 }
 if(state==='help'&&supportsBoost(vehicle.id)){
   $('dialogBody').querySelector('.rows').insertAdjacentHTML('beforeend','<div>一键 Boost<b>'+(touchDevice?'轻点 BOOST':'按 B')+'，再按结束</b></div>');
   $('dialogBody').querySelector('.rows').insertAdjacentHTML('afterend','<p>出弯时开启 Boost 再踩油门，加快中高车速下的提速。持续 20 秒，结束后冷却 30 秒。</p>');
 }
});
function recoverCar(){
 const occupied=rivals.map(r=>footprint(sample,r));
 for(let back=0;back<=96;back+=8)for(const lane of [0,-2.8,2.8]){
   const s=player.s-back, box=footprint(sample,{s,lane,vehicleId:vehicle.id});
   if(occupied.some(r=>Math.hypot(r.x-box.x,r.z-box.z)<7))continue;
   Object.assign(player,{s,lane,h:0,v:0,gear:1,reverseHold:0,slip:0,steer:0,yawRate:0,pitch:0,roll:0,contact:0});
   resetTransient(driveStats);sampleTelemetry(driveStats,player,0,inputs);remember(player);simAcc=0;camFresh=true;overlayResume();announce('已回到赛道');return;
 }
}
function pause(){if(state==='paused'){overlayResume();return;}if(!['race','countdown'].includes(state))return;modeBeforeModal=state;state='paused';dialog(inTestDrive()?'试驾已暂停':'比赛已暂停','<p>'+(onRunway()?'机场性能测试':section(player.s)[1])+'　·　'+timeString(elapsed)+'</p><p><label>画质　<select id="qualityPause" class="quality"></select></label></p>'+(modeBeforeModal==='race'&&!onRunway()?'<button class="small" id="recover">移回赛道</button>':''),[['继续驾驶',overlayResume],['重新发车',startRace],inTestDrive()?['结束并查看报告',()=>resultDialog('试驾报告',[])]:['返回车库',garage]]);
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
function garage(){demoControls?.reset();closeDialog();resetKeys();state='garage';toggleShell(false);stage.garage.add(carRoot);carRoot.position.set(0,.015,0);carRoot.rotation.set(0,0,0);eye.clearViewOffset();camFresh=true;audioUpdate();}
function startRace(){
 if(!ready)return;setCabinPreview(false);closeDialog();resetKeys();toggleShell(true);
 const route=eventType==='practice'?routeInfo.practice[sectorKeys.indexOf(sector)]:
   {start:0,end:onRunway()?RUNWAY.target:freeDrive()?LENGTH:raceLength()};
 if(onRunway()){runwayScene??=createAirfieldScene(stage.world);runwayTrial=newRunwayTrial();}
 raceScene=onRunway()?runwayScene:worlds.select(routeInfo);
 startDistance=route.start;total=route.end;splits=[];previousSplits=[];
 gateIndex=0;deadline=0;gateBonuses=[];radarSpeeds=[];radarTarget=0;rounds=[];gates=[];
 boost=newBoost();inputs.boost=false;
 pursuit=eventType==='pursuit'?pursuitPlan(vehicle,difficulty):null;
 racingLine=eventType==='racingline'?racingLinePlan(total,difficulty):null;
 if(racingLine)gates=racingLine.gates.map(gate=>gate.s);
 else if(eventType==='checkpoint'){
   const plan=checkpointPlan(total,difficulty,vehicle.id);gates=plan.gates;deadline=plan.allowance;gateBonuses=plan.bonuses;
 }else if(eventType==='speedtrap'){
   gates=speedTraps(total);radarTarget=speedTrapTarget(total,difficulty,vehicle.id);
 }
 else if(eventType==='elimination'){rounds=eliminationRounds(total);gates=rounds.map(r=>r.line);}
 moveChallengeMarker();
 if(eventType==='time'){try{const saved=JSON.parse(localStorage.getItem(bestKey()+'.splits'));if(Array.isArray(saved)&&saved.length===3&&saved.every(Number.isFinite))previousSplits=saved;}catch{}}
 rivals.length=0;
 for(const car of carPool){
   car.object.visible=hasRivals()&&(!pursuit||rivals.length===0);
   if(car.object.visible)rivals.push(car);
 }
 state='countdown';remaining=3;elapsed=0;viewMode=freeDrive()?3:0;alertLife=0;wasOff=false;
 Object.assign(player,{s:hasRivals()?-42:startDistance,lane:hasRivals()?2.25:0,v:0,gear:1,reverseHold:0,h:0,steer:0,roll:0,pitch:0,yawRate:0,slip:0,finish:null,contact:0});(onRunway()?runwayScene:worlds.actors).add(carRoot);stage.sprintFinish.visible=!onRunway()&&total<LENGTH;
 if(stage.sprintFinish.visible)place(stage.sprintFinish,total,0);
 const posts=(routeInfo.id==='nord'?trackPosts:trackPosts.filter(post=>post.sprintOnly))
   .map(post=>post.sprintOnly?{...post,s:total}:post);
 driveStats=createTelemetry();sampleTelemetry(driveStats,player,0,inputs);demoControls?.reset();
 $('pauseBtn').textContent=inTestDrive()?'试驾菜单':'暂停';
 resolveContacts=onRunway()?null:createContacts(sample,STEP,LENGTH,posts);simAcc=0;
 rivals.forEach((r,i)=>Object.assign(r,{grid:i,s:-(i+1)*7,lane:i%2?2.25:-2.25,targetLane:i%2?2.25:-2.25,v:0,slip:0,h:0,finish:null}));
 if(pursuit){
   player.s=startDistance;
   Object.assign(rivals[0],{s:startDistance+pursuit.lead,lane:-1.7});
 }
 for(const car of [player,...rivals])remember(car);
 camFresh=true;eye.clearViewOffset();eye.updateProjectionMatrix();rafTime=0;uiTick=1;showWing();beep();updateHUD();renderFrame(0,1);
}
bind('startBtn',startRace);
function announce(text,life=1){alertText=text;alertLife=life;}
function bestKey(){
 const course=eventType==='practice'?sector:eventType==='airfield'?'runway':mode;
 const venue=routeInfo.id==='nord'||onRunway()?'':'.'+routeInfo.id;
 const key=['nordrun.su7.v3',eventType,course,competitionRecordGroup(eventType,difficulty)].join('.')+venue;
 // Existing records were all set in the original Max.
 return vehicle.id==='max'?key:key+'.'+vehicle.id;
}
function best(){try{return parseFloat(localStorage.getItem(bestKey()))||0;}catch{return 0;}}
function rank(){
 if(player.finish!==null)return 1+rivals.filter(r=>r.finish!==null&&r.finish<=player.finish).length;
 return 1+rivals.filter(r=>r.finish!==null||r.s>player.s).length;
}
function crossingTime(car,line,dt){
 const fraction=crossingFraction(car,line);
 return elapsed-(1-fraction)*dt;
}
const resultRow=(label,value)=>'<div>'+label+'<b>'+value+'</b></div>';
function resultDialog(title,rows,promote=false){
 state='finished';updateHUD();
 let comparison='';
 if(inTestDrive()){
   const venue=freeDrive()&&routeInfo.id!=='nord'?eventType+'.'+routeInfo.id:eventType;
   const report=testReport(venue,vehicle.id,driveStats);comparison=report.comparison;
   rows.push(...report.rows.map(([label,v])=>resultRow(label,v)));
 }
 if(boost.uses)rows.push(resultRow('Boost 使用',boost.uses+' 次'));
 const actions=[['再跑一次',startRace],[inTestDrive()?'回车库换车':'返回车库',garage]];
 const selector=$('difficulty'),next=selector.options[selector.selectedIndex+1];
 if(promote&&next){
   actions.push(['挑战'+next.textContent+'难度',()=>{
     selector.value=next.value;selector.dispatchEvent(new Event('change'));startRace();
   }]);
 }
 dialog(title,'<div class="rows">'+rows.join('')+'</div>'+comparison,actions);
}
function finish(){
 player.finish=elapsed;
 if(pursuit||racingLine){
   const qualified=!racingLine||racingLine.hits>=racingLine.required;
   const score=elapsed+(racingLine?racingLine.misses*MISS_SECONDS:0);
   let record=best();
   if(qualified&&(!record||score<record)){
     record=score;
     try{localStorage.setItem(bestKey(),String(record));}catch{}
   }
   const rows=[];
   if(racingLine){
     rows.push(resultRow('命中 / 全部',racingLine.hits+' / '+gates.length+'（达标 '+racingLine.required+'）'),
       resultRow('用时 / 加罚',timeString(elapsed)+' / +'+racingLine.misses*MISS_SECONDS+' 秒'),
       resultRow('最终用时',timeString(score)));
   }else{
     rows.push(resultRow('追回发车差距',pursuit.lead+' m'),resultRow('冲线用时',timeString(score)));
   }
   rows.push(resultRow('本级个人最佳',record?timeString(record):'—'));
   resultDialog(pursuit?'追击成功':qualified?'走线达标':'走线未达标',rows,!!pursuit||racingLine.misses===0);
   return;
 }
 const old=best(),isRadar=eventType==='speedtrap';
 const score=isRadar?radarSpeeds.reduce((sum,v)=>sum+v,0)/radarSpeeds.length:elapsed;
 const improved=!old||(isRadar?score>old:score<old);
 if(improved){try{localStorage.setItem(bestKey(),String(score));if(eventType==='time')localStorage.setItem(bestKey()+'.splits',JSON.stringify(splits));}catch{}}
 const rows=[resultRow('赛程',((total-startDistance)/1000).toFixed(3)+' KM')];
 if(eventType==='race'||eventType==='elimination'){
   const firstFinish=Math.min(...rivals.map(r=>r.finish??Infinity));
   if(firstFinish<=elapsed)rows.push(resultRow('落后头车',(elapsed-firstFinish).toFixed(2)+' 秒'));
   else if(rivals.length)rows.push(resultRow('冲线领先',Math.max(0,Math.round(total-Math.max(...rivals.map(r=>r.s))))+' 米'));
 }
 if(eventType==='time')splits.forEach((t,i)=>rows.push(resultRow('第 '+(i+1)+' 段',timeString(t-(splits[i-1]||0)))));
 if(isRadar){
   radarSpeeds.forEach((v,i)=>rows.push(resultRow('测速门 '+(i+1),v.toFixed(1)+' km/h')));
   rows.push(resultRow(paceSettings[difficulty].label+'目标',radarTarget+' km/h'),resultRow('三门均速',score.toFixed(1)+' km/h'),resultRow('个人最高',(improved?score:old).toFixed(1)+' km/h'));
 }else{
   if(eventType==='checkpoint')rows.push(resultRow('剩余时间',timeString(Math.max(0,deadline-elapsed))));
   rows.push(resultRow('本次用时',timeString(elapsed)),resultRow('个人最佳',timeString(improved?score:old)));
 }
 const titles={time:'计时完成',practice:'练习段完成',checkpoint:'限时闯关成功',speedtrap:score>=radarTarget?'测速达标':'测速未达标'};
 resultDialog(hasRivals()?'冲线！第 '+rank()+' 名':titles[eventType],rows,
   hasRivals()&&rank()===1||eventType==='checkpoint'||isRadar&&score>=radarTarget);
}
function advanceRunway(dt){
 const hadHundred=runwayTrial.hundred!==null,hadSplit=runwayTrial.quarter!==null;
 const result=stepRunwayTrial(runwayTrial,player,elapsed,dt);
 if(!hadHundred&&runwayTrial.hundred!==null)announce('0–100 km/h　'+runwayTrial.hundred.toFixed(2)+' 秒',2);
 if(!hadSplit&&runwayTrial.quarter!==null)announce('400 m　'+runwayTrial.quarter.toFixed(2)+' 秒',2);
 if(!result)return;
 const key=bestKey()+'.metrics', stages=[['hundred','0–100 km/h',' s'],['quarter','400 m',' s'],['error','偏离靶心',' m']];
 let best={};
 try{const data=JSON.parse(localStorage.getItem(key));if(data&&typeof data==='object')best=data;}catch{}
 const valid=runwayTrial.error!==null;
 const rows=stages.map(([metric,label,unit])=>{
   const value=runwayTrial[metric],last=best[metric];
   const saved=Number.isFinite(last)&&last>=0?last:null;
   if(valid)best[metric]=Math.min(value,saved??value);
   const record=valid?best[metric]:saved;
   return resultRow(label,(value===null?'—':value.toFixed(2)+unit)+' / '+(record===null?'—':record.toFixed(2)+unit));
 });
 if(valid){try{localStorage.setItem(key,JSON.stringify(best));}catch{}}
 resultDialog(result,[resultRow('测试项目','本次 / 车型最佳'),...rows]);
}
function advanceChallenge(dt){
 if(pursuit){
   const finishTime=rivals[0].finish;
   if(finishTime!==null&&(player.s<total||finishTime<=crossingTime(player,total,dt))){
     const fraction=clamp(1-(elapsed-finishTime)/dt,0,1);
     const gap=Math.max(0,total-lerp(player.previous.s,player.s,fraction));
     elapsed=finishTime;
     resultDialog('对手率先冲线',[resultRow('冲线时落后',gap.toFixed(1)+' m'),
       resultRow('对手用时',timeString(finishTime)),resultRow('发车差距',pursuit.lead+' m')]);
   }
 }else if(racingLine){
   const gate=racingLine.gates[gateIndex];
   const mark=judgeLineGate(gate,player);
   if(mark){
     const hit=mark==='命中';
     if(hit)racingLine.hits++;else racingLine.misses++;
     gateIndex++;moveChallengeMarker();
     announce(gate.phase+' · '+mark+(hit?'':'　+4 秒'),1.35);beep(hit);
   }
 }else if(eventType==='elimination'&&gateIndex<rounds.length){
   const field=[player,...rivals];
   const previousTarget=nextGate();
   recordEliminationCrossings(rounds,field,elapsed,dt);
   if(nextGate()!==previousTarget)moveChallengeMarker();
   const round=rounds[gateIndex],order=cutOrder(round,field);
   if(!order)return;
   const out=order.slice(round.qualifiers);
   if(out.includes(player)){
     resultDialog('在淘汰线止步',[resultRow('名次','第 '+(order.indexOf(player)+1)+' 名'),resultRow('淘汰线',(round.line/1000).toFixed(2)+' KM')]);return;
   }
   for(const car of out){car.object.visible=false;rivals.splice(rivals.indexOf(car),1);}
   gateIndex++;moveChallengeMarker();announce(gateIndex===2?'进入决赛　两车争冠':'晋级　场上剩余四车',2.0);beep(true);
 }else if(eventType==='checkpoint'){
   const line=nextGate();
   const crossed=player.previous.s<line&&player.s>=line;
   if((crossed?crossingTime(player,line,dt):elapsed)>deadline){
     elapsed=deadline;
     resultDialog('时间耗尽',[resultRow('通过计时门',gateIndex+' / '+gates.length),resultRow('距下一目标',Math.ceil(Math.max(0,line-player.s))+' m')]);return;
   }
   if(crossed&&gateIndex<gates.length){
     const bonus=gateBonuses[gateIndex++];deadline+=bonus;moveChallengeMarker();announce('通过计时门　+'+bonus.toFixed(1)+' 秒',1.8);beep(true);
   }
 }else if(eventType==='speedtrap'&&gateIndex<gates.length){
   const line=gates[gateIndex];
   if(player.previous.s<line&&player.s>=line){
     const speed=lerp(player.previous.v,player.v,crossingFraction(player,line))*3.6;
     radarSpeeds.push(speed);gateIndex++;moveChallengeMarker();announce('测速 '+gateIndex+' / 3　'+speed.toFixed(1)+' km/h',2.1);beep(true);
   }
 }
}
function aiStep(dt){
 if(!rivals.length)return;
 const profile=rivalProfile(difficulty,vehicle.id);
 rivals.forEach(r=>{
  const i=r.grid;
  if(r.finish!==null){r.s+=dt*r.v;r.v=Math.max(0,r.v-1.7*dt);return;}
  const ahead=[...rivals,player].filter(x=>x!==r&&x.s>r.s&&x.s-r.s<30&&Math.abs(x.lane-r.lane)<2.35).sort((a,b)=>a.s-b.s)[0];
  const road=rivalRoad(profile,r.s),bend=curvature(r.s+9,17);
  let want=road.target*(1-i*.008);
  const apex=clamp(bend*140,-2.5,2.5),entry=clamp(curvature(r.s+r.v*.95+20,24)*130,-2.2,2.2);
  const line=profile.skill.line;
  let lane=clamp(r.home*(1-line*.55)+line*(apex-entry*.56)+Math.sin(r.s*.0033+i)*.38,-3.65,3.65);
  if(ahead){const option=ahead.lane>0?-2.6:2.6;
   if(![...rivals,player].some(x=>x!==r&&Math.abs(x.s-r.s)<7&&Math.abs(x.lane-option)<1.9))lane=option;
   if(ahead.s-r.s<7&&Math.abs(ahead.lane-r.lane)<1.9)want=Math.min(want,Math.max(1,ahead.v-1.7));}
  r.slip=damp(r.slip||0,clamp((lane-r.lane)*1.55,-2.4,2.4),4.0,dt);
  r.lane+=r.slip*dt;r.h=damp(r.h||0,Math.atan2(r.slip,Math.max(8,r.v)),5,dt);
  r.v=rivalSpeed(profile,r.v,want,road.grade,i,dt);r.s+=r.v*dt;
 });
}
function step(dt){
 remember(player);for(const rival of rivals)remember(rival);
 wing=damp(wing,wingOpen?1:0,4.2,dt);
 if(state==='countdown'){let prev=Math.ceil(remaining);remaining=Math.max(0,remaining-dt);if(Math.ceil(remaining)!==prev)beep(remaining===0);if(remaining===0){state='race';announce('发车',1.05);}return;}
 if(state!=='race')return;
 // Every event uses a standing start and times from the green light.
 elapsed+=dt;alertLife=Math.max(0,alertLife-dt);player.contact=Math.max(0,player.contact-dt);
 const p=player,road=onRunway()?runwaySample(p.s):sample(p.s);
 inputs.boost=elapsed-dt<boost.end&&p.gear===1;
 const grass=driveCar(p,inputs,road.grade,onRunway()?0:curvature(p.s,12),wing,dt,onRunway());
 if(p.gear===-1)endBoost(boost,elapsed);
 if(onRunway()){sampleTelemetry(driveStats,p,dt,inputs);advanceRunway(dt);return;}
 if(grass&&!wasOff&&p.v>8)announce('驶上草地',.85);wasOff=grass;
 if(pursuit)stepPursuitTarget(rivals[0],pursuit,dt);
 else aiStep(dt);
 const hit=resolveContacts([p,...rivals],stage.sprintFinish.visible);
 if(freeDrive())sampleTelemetry(driveStats,p,dt,inputs,hit);
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
 advanceChallenge(dt);
 if(state==='finished')return;
 if(!freeDrive()&&p.s>=total){elapsed=crossingTime(p,total,dt);finish();}
}
function moveChallengeMarker(){
 const marker=stage.challengeMarker;
 for(const [offset,visual] of stage.lineMarkers.entries()){
   const gate=racingLine?.gates[gateIndex+offset];
   visual.visible=!!gate;
   if(gate){
     visual.scale.x=gate.halfWidth+vehicle.width/2;
     place(visual,gate.s,gate.lane);
   }
 }
 marker.visible=!racingLine&&nextGate()<total;
 if(marker.visible){
   marker.userData.ink.color.setHex(eventType==='speedtrap'?0xffc65f:eventType==='elimination'?0xff815e:0x58f3cb);
   place(marker,nextGate(),0);
 }
}
function drawMap(){
 const c=$('mini').getContext('2d'),w=c.canvas.width,h=c.canvas.height;
 if(onRunway()){
   c.clearRect(0,0,w,h);const y=h*.50,x=s=>15+clamp(s/620,0,1)*(w-30);
   c.fillStyle='#617173';c.fillRect(12,y-12,w-24,24);c.fillStyle='#eadcaa';c.fillRect(x(400),y-12,3,24);
   c.fillStyle='#e7a349';c.fillRect(x(590),y-12,x(610)-x(590),24);
   c.beginPath();c.arc(x(player.s),y+player.lane*1.5,7,0,2*Math.PI);c.fillStyle='#78fff1';c.fill();return;
 }
 const pt=roadMap.draw(c,8);
 if(total-startDistance<LENGTH){c.beginPath();for(let s=startDistance;s<total+28;s+=28){const p=sample(Math.min(s,total)),v=pt(p.x,p.z);if(s>startDistance)c.lineTo(...v);else c.moveTo(...v);}c.strokeStyle='#74e2d9';c.lineWidth=4;c.stroke();}
 if(nextGate()<total){const g=sample(nextGate()),[x,y]=pt(g.x,g.z);c.strokeStyle='#ffdc81';c.lineWidth=2;c.strokeRect(x-4,y-4,8,8);}
 for(const r of [...rivals,player]){const p=sample(r.s),pos=pt(p.x,p.z);c.beginPath();c.arc(...pos,r===player?5.5:3.4,0,2*Math.PI);c.fillStyle=r===player?'#80fff2':'#f7ab72';c.fill();if(r===player){c.strokeStyle='#103b46';c.lineWidth=2;c.stroke();}}
}
function cornerHint(){
 if(state!=='race')return '';
 if(player.gear===-1)return viewMode>=2?'倒车影像':'倒车';
 const gate=racingLine?.gates[gateIndex];
 if(gate&&gate.s-player.s<260){
   return gate.phase+'靠'+(gate.lane>0?'右':'左')+'　≥ '+gate.minKph+' km/h';
 }
 if(onRunway()){
   const distance=RUNWAY.target-player.s,brakingDistance=player.v*player.v/25+player.v*.3;
   if(Math.abs(player.lane)>4) return '向跑道中央靠拢';
   if(distance<18)return '在黄框内停稳';
   if(distance<=brakingDistance+12)return '刹车 · 前方停车区';
   if(runwayTrial.quarter!==null)return '准备制动';
   return '';
 }
 const horizon=clamp(player.v*2.7,65,165);
 for(let ahead=20;ahead<=horizon&&(freeDrive()||player.s+ahead<total);ahead+=15){
   const bend=curvature(player.s+ahead,20),k=Math.abs(bend);
   if(k<.009)continue;
   const direction=bend>0?'右':'左';
   return (ahead<40?'入弯':Math.round(ahead/10)*10+' m')+'　'+direction+(k>=.019?'急弯':'弯');
 }
 return '';
}
function updateHUD(){
 paintBoost();
 const challenge=Object.hasOwn(challengeBriefs,eventType),timed=eventType==='checkpoint';
 const count=eventType==='time'?Math.min(splits.length+1,3)+'/3':gateIndex+'/'+gates.length;
 $('metricLabel').textContent=hasRivals()?'排名 / POS':eventType==='practice'?'练习 / SECTOR':eventType==='speedtrap'?'测速门':'计时点';
 $('position').textContent=hasRivals()?rank()+'/'+(rivals.length+1):eventType==='practice'?Math.round(clamp((player.s-startDistance)/(total-startDistance),0,1)*100)+'%':count;
 const radar=eventType==='speedtrap';
 $('clockLabel').textContent=timed?'倒计时 / TIME':radar?'均速 / 目标 '+radarTarget:'用时 / TIME';$('clock').classList.toggle('urgent',timed&&deadline-elapsed<=8);
 $('clock').textContent=radar?(radarSpeeds.length?(radarSpeeds.reduce((a,b)=>a+b,0)/radarSpeeds.length).toFixed(1):'—'):timeString(timed?Math.max(0,deadline-elapsed):elapsed);
 const next=challenge&&nextGate()<total;
 $('distanceLabel').textContent=next?(eventType==='elimination'?'淘汰线 / KM':eventType==='speedtrap'?'测速门 / KM':'下道门 / KM'):'终点 / KM';
 $('remain').textContent=(Math.max(0,(next?nextGate():total)-Math.max(startDistance,player.s))/1000).toFixed(2);
 if(pursuit){
   const gap=rivals[0].s-player.s;
   $('metricLabel').textContent=gap>0?'落后 / M':'领先 / M';
   $('position').textContent=Math.round(Math.abs(gap));
 }else if(racingLine){
   $('metricLabel').textContent='命中 / 目标';
   $('position').textContent=racingLine.hits+'/'+racingLine.required;
   $('clockLabel').textContent='含罚时 / TIME';
   $('clock').textContent=timeString(elapsed+racingLine.misses*MISS_SECONDS);
   const gate=racingLine.gates[gateIndex];
   if(gate){
     $('distanceLabel').textContent=gate.phase+' · '+(gate.lane>0?'右':'左')+' / M';
     $('remain').textContent=Math.max(0,Math.ceil(gate.s-player.s));
   }
 }
 const braking=brakeLights(),reverse=player.gear===-1;
 $('gear').textContent=reverse?'R':'D';$('gear').classList.toggle('reverse',reverse);
 const peakPower=inputs.boost&&inputs.gas&&!braking&&!reverse;
 $('speed').textContent=Math.round(Math.abs(player.v)*3.6);$('power').style.width=(braking||peakPower?100:tractionInput()?clamp(100-Math.abs(player.v)*.48,35,100):9)+'%';$('power').style.background=peakPower?'#ffb25f':braking?'#ff956d':'var(--aqua)';
 $('progress').style.width=clamp((player.s-startDistance)/(total-startDistance)*100,0,100)+'%';
 if(onRunway()){
   $('metricLabel').textContent='零百 / S';$('position').textContent=runwayTrial.hundred===null?'—':runwayTrial.hundred.toFixed(2);
   const runSeconds=runwayTrial.launchTime===null?0:Math.max(0,elapsed-runwayTrial.launchTime);
   $('clockLabel').textContent='400 M / S';$('clock').textContent=(runwayTrial.quarter??runSeconds).toFixed(2);
   $('distanceLabel').textContent='距靶心 / M';$('remain').textContent=Math.max(0,Math.round(RUNWAY.target-player.s));
   $('sectionName').textContent='机场测试跑道';$('sectionCn').textContent=runwayTrial.quarter===null?'加速段':'制动区';
 }else{
   if(freeDrive()){
     $('metricLabel').textContent='最高 / KM/H';$('position').textContent=Math.round(driveStats.topSpeedKph);
     $('distanceLabel').textContent='里程 / KM';$('remain').textContent=(driveStats.distanceM/1000).toFixed(2);
     $('progress').style.width=((player.s%LENGTH+LENGTH)%LENGTH/LENGTH*100)+'%';
   }
   const sc=section(freeDrive()?player.s:Math.max(0,player.s));$('sectionName').textContent=sc[1];$('sectionCn').textContent=sc[2];}
 const hint=cornerHint();$('cornerHint').hidden=!hint;$('cornerHint').textContent=hint;
 $('count').textContent=state==='countdown'?Math.ceil(remaining):'';
 $('alert').hidden=alertLife<=0;$('alert').textContent=alertText;drawMap();
}
function renderFrame(dt,alpha=1){
 const inGarage=state==='garage'||state==='help'&&modeBeforeModal==='garage',portrait=eye.aspect<1;
 if(inGarage)wing=damp(wing,wingOpen?1:0,4.2,dt);
 demoControls?.update(inTestDrive()&&(state==='race'||state==='countdown'));
 model.updateWing(wing);
 const car=present(player,alpha);
 const reversing=!inGarage&&player.gear===-1;
 model.cockpit(inGarage?previewCabin:!reversing&&viewMode===3);
 model.suspension(inGarage?0:car.pitch,inGarage?0:car.roll);
 model.drive(inGarage?0:car.v,inGarage?0:car.steer,state==='race'&&brakeLights(),state==='race'?dt:0,reversing);
 if(inGarage&&previewCabin){
   eye.clearViewOffset();eye.position.copy(model.cockpitEye()).add(carRoot.position);
   look.copy(eye.position).addScaledVector(lookDirection,18);eye.lookAt(look);eye.near=.035;eye.fov=portrait?82:68;
   eye.updateProjectionMatrix();renderer.render(stage.garage,eye);return;
 }
 if(inGarage){
  eye.near=.12;const w=app.clientWidth,h=app.clientHeight;
  const distance=portrait?Math.max(7.0,7.25/eye.aspect):Math.max(6.6,9.5/eye.aspect);
  eye.fov=36;eye.setViewOffset(w,h,portrait?0:-w*.135,portrait?h*.205:0,w,h);
  eye.position.set(Math.sin(garageAngle)*distance, .55+distance*Math.sin(garagePitch),Math.cos(garageAngle)*distance);eye.lookAt(0,.61,0);
  renderer.render(stage.garage,eye);return;
 }
 const road=onRunway()?placeOnRunway(carRoot,car.s,car.lane,.018,car.h):place(carRoot,car.s,car.lane,.018,car.h);
 for(const r of rivals){
   const ai=present(r,alpha);place(r.object,ai.s,ai.lane,.016,ai.h);
   r.object.visible=r.object.position.distanceToSquared(carRoot.position)<700*700;
   if(r.object.visible){
     const deployment=T.MathUtils.smoothstep(ai.v,24,39);
     for(const level of r.object.levels)level.object.userData.setWing(deployment);
   }
 }
 const camDistance=viewMode===1?10.5:6.9;
 const roadSample=onRunway()?runwaySample:sample;
 const rear=roadSample(car.s-8),lead=roadSample(car.s+13+car.v*.085);
 const heading=Math.atan2(lead.x-rear.x,lead.z-rear.z)-car.h*(viewMode===2?.55:.16);
 const slope=Math.atan2(lead.y-rear.y,Math.hypot(lead.x-rear.x,lead.z-rear.z));
 viewYaw=camFresh?heading:turnToward(viewYaw,heading,viewMode===2?14:10,dt);
 viewPitch=camFresh?slope:damp(viewPitch,slope,6,dt);
 smoothLane=camFresh?car.lane:damp(smoothLane,car.lane,10,dt);
 const dx=Math.sin(viewYaw),dz=Math.cos(viewYaw);
 if(viewMode===2){
   desired.copy(model.hoodEye()).applyQuaternion(carRoot.quaternion).add(carRoot.position);
 }else{
   desired.set(road.x-road.tz*smoothLane-dx*camDistance,road.y+(viewMode===1?4.35:2.61)-Math.tan(viewPitch)*camDistance,road.z+road.tx*smoothLane-dz*camDistance);
 }
 eye.position.copy(desired);const distance=24;
 look.set(desired.x+dx*distance,desired.y+distance*(Math.tan(viewPitch)-(viewMode===2?.032:viewMode===1?.189:.143)),desired.z+dz*distance);
 eye.lookAt(look);
 const fov=(portrait?(viewMode===2?73:75):(viewMode===2?67:54))+Math.abs(car.v)*.068;
 smoothFov=camFresh?fov:damp(smoothFov,fov,3.5,dt);camFresh=false;
 eye.fov=smoothFov;eye.far=onRunway()||routeInfo.id==='nord'?1450:7000;eye.near=.12;
 if(reversing&&viewMode>=2){
   desired.copy(model.rearEye()).applyQuaternion(carRoot.quaternion).add(carRoot.position);
   look.set(0,-.11,-1).applyQuaternion(carRoot.quaternion).multiplyScalar(18).add(desired);
   eye.position.copy(desired);eye.lookAt(look);eye.fov=76;eye.near=.06;
 }else if(viewMode===3){
   // Seat and camera share the same car pose so the dash stays still through a bend.
   desired.copy(model.cockpitEye()).applyQuaternion(carRoot.quaternion).add(carRoot.position);
   look.set(0,-.072,1).applyQuaternion(carRoot.quaternion).multiplyScalar(18).add(desired);
   eye.position.copy(desired);eye.lookAt(look);eye.fov=portrait?82:68;eye.near=.035;
 }
 eye.updateProjectionMatrix();
 tunnelCover=onRunway()?0:worlds.update(car.s,elapsed);
 renderer.render(raceScene,eye);
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
 else if(e.code==='KeyB'&&state==='race'){e.preventDefault();useBoost();}
 else if(e.code==='KeyP'||e.code==='Escape'){if(state==='help')overlayResume();else if(state==='garage'&&previewCabin)setCabinPreview(false);else pause();}
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
 if(state==='garage'&&previewCabin){setCabinPreview(false);return true;}
 return false;
};
gameCanvas.addEventListener('pointerdown',e=>{if(state!=='garage'||previewCabin)return;drag={x:e.clientX,y:e.clientY};gameCanvas.setPointerCapture(e.pointerId);});
gameCanvas.addEventListener('pointermove',e=>{if(!drag)return;garageAngle-=(e.clientX-drag.x)*.009;garagePitch=clamp(garagePitch+(e.clientY-drag.y)*.004,.05,.59);drag={x:e.clientX,y:e.clientY};});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])gameCanvas.addEventListener(ev,()=>drag=null);
document.addEventListener('visibilitychange',()=>{if(document.hidden){resetKeys();if(state==='race'||state==='countdown')pause();}rafTime=0;});window.addEventListener('blur',()=>{resetKeys();if(state==='race'||state==='countdown')pause();});
async function boot(){
 renderer=new T.WebGLRenderer({canvas:gameCanvas,antialias:true,powerPreference:'high-performance'});renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
 resize();[stage,model]=await Promise.all([setupStage(renderer),carModel(modelBytes)]);carRoot.add(model.object);
 worlds=createRouteWorlds(stage);
 model.updateWing(0);
 for(let i=0;i<5;i++){
   const object=new T.LOD();
   object.addLevel(model.makeOpponent(colors[i]),0);
   object.addLevel(model.makeDistant(colors[i]),30,.12);
   worlds.actors.add(object);
   carPool.push({name:carNames[i],object,home:(i%2?1:-1)*(1.5+.22*i)});
 }
 demoControls=createTestDriveControls(carRoot);demoControls.setVehicle(vehicle.id);demoControls.bindPanel($('driveTools'),()=>soundOn);
 model.setVehicle(vehicle.id);model.updateWing(0);applyGraphics();stage.garage.add(carRoot);ready=true;$('startBtn').disabled=false;updateGarage();showWing();garage();frame(performance.now());
 if(location.search.includes('qa=1'))window.__qa={state:()=>({state,routeId:onRunway()?'airfield':routeInfo.id,vehicleId:vehicle.id,boost:boostStatus(),testStats:{...driveStats},s:player.s,lane:player.lane,heading:player.h,speed:player.v,gear:player.gear??1,wing,wingOpen,rank:rank(),total,elapsed,eventType,difficulty,sector,startDistance,gateIndex,gates:[...gates],deadline,runway:onRunway()?{...runwayTrial}:null,radarSpeeds:[...radarSpeeds],splits:[...splits],rivals:rivals.map(r=>({s:r.s,v:r.v,finish:r.finish})),viewMode}),advance:(seconds)=>{for(let i=0;i<seconds/PHYSICS_DT;i++)step(PHYSICS_DT);updateHUD();},info:()=>renderer.info.render,render:()=>renderFrame(1/60)};
 if(window.__qa)window.__qa.club=()=>({
   pursuitLead:pursuit?.lead??null,
   line:racingLine?{...racingLine,gates:racingLine.gates.map(gate=>({...gate}))}:null
 });
}
boot().catch(e=>{console.error(e);$('error').hidden=false;$('error').innerHTML='<p>三维画面未能启动。请用支持 WebGL 的新版 Chrome、Edge 或 Safari 打开，并启用图形加速。</p><button class="small" onclick="location.reload()">重新载入</button>';});
