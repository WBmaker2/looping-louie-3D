import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Simulation, CONFIG } from './physics.js';
import { FrameClock } from './frame-clock.js';
import { GameAudio } from './game-audio.js';
import { createRoundState } from './round-state.js';
import { playerBindings, playerName, elapsedTime } from './player-mode.js';

const $=id=>document.getElementById(id);
const COLORS=['#ef4444','#3b82f6','#22c55e','#f59e0b'];
const canvas=$('canvas');

let renderer, scene, cameraPersp, cameraOrtho, controllers, view=null;
let boardGroup, armGroup, planeGroup, paddleMeshes=[], chickenMeshes=[];
let sim=new Simulation();
let prevAngle=null;
function resetRound(){const s=createRoundState(prevAngle);prevAngle=s.startAngle;sim.reset(s)}
resetRound();
let bindings=playerBindings(1);
const isHuman=id=>bindings.some(b=>b.player===id);
let countdownEnd=null, sound=true;

function mat(color,rough=0.8){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:0.05})}
function mesh(geo,material,x=0,y=0,z=0){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m}

function makeChicken(color=0xffffff){
  const g=new THREE.Group();
  const body=mesh(new THREE.SphereGeometry(0.28,20,16),mat(color),0,0.25,0);body.scale.set(1,0.9,1.2);g.add(body);
  const head=mesh(new THREE.SphereGeometry(0.16,16,12),mat(color),0,0.55,0.12);g.add(head);
  const beak=mesh(new THREE.ConeGeometry(0.06,0.14,12),mat(0xff8c00),0,0.52,0.3);beak.rotation.x=Math.PI/2;g.add(beak);
  const comb=mesh(new THREE.SphereGeometry(0.08,10,8),mat(0xef4444),0,0.7,0.08);comb.scale.set(1,1.4,0.5);g.add(comb);
  const tail=mesh(new THREE.ConeGeometry(0.14,0.28,10),mat(color),0,0.4,-0.28);tail.rotation.x=-0.6;g.add(tail);
  const eyeL=mesh(new THREE.SphereGeometry(0.03,8,8),mat(0x000000),-0.08,0.6,0.24);const eyeR=eyeL.clone();eyeR.position.x=0.08;g.add(eyeL,eyeR);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true}});
  return g;
}
function makePlane(){
  const g=new THREE.Group();
  const fus=mesh(new THREE.CapsuleGeometry(0.28,0.7,6,14),mat(0xef4444,0.5),0,0,0);fus.rotation.z=Math.PI/2;g.add(fus);
  const wing=mesh(new THREE.BoxGeometry(0.18,0.08,1.6),mat(0xffcc00,0.5),0,0.05,0);g.add(wing);
  const tailWing=mesh(new THREE.BoxGeometry(0.14,0.06,0.7),mat(0xffcc00),-0.45,0.15,0);g.add(tailWing);
  const tailFin=mesh(new THREE.BoxGeometry(0.08,0.35,0.25),mat(0x3b82f6),-0.45,0.25,0);g.add(tailFin);
  const cockpit=mesh(new THREE.SphereGeometry(0.18,14,12),mat(0x88ccff,0.2),0.1,0.18,0);cockpit.scale.set(1.2,0.7,1);g.add(cockpit);
  const pilotHead=mesh(new THREE.SphereGeometry(0.11,12,10),mat(0xffd9b3),0.05,0.28,0);g.add(pilotHead);
  const hat=mesh(new THREE.CylinderGeometry(0.13,0.15,0.08,12),mat(0x7c3aed),0.05,0.36,0);g.add(hat);
  const prop=mesh(new THREE.BoxGeometry(0.04,0.7,0.1),mat(0x333333),0.55,0,0);g.add(prop);
  const nose=mesh(new THREE.ConeGeometry(0.1,0.15,10),mat(0xffe066),0.6,0,0);nose.rotation.z=-Math.PI/2;g.add(nose);
  g.userData.prop=prop;
  return g;
}
function makeTree(){
  const g=new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.12,0.18,1.2,10),mat(0x8b4513),0,0.6,0));
  g.add(mesh(new THREE.SphereGeometry(0.9,14,12),mat(0x2e8b57),0,1.6,0));
  g.add(mesh(new THREE.SphereGeometry(0.6,12,10),mat(0x3cb371),0.5,1.2,0.2));
  return g;
}
function makeBarn(){
  const g=new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(2.4,1.4,1.8),mat(0xdc2626),0,0.7,0));
  const roof=mesh(new THREE.ConeGeometry(1.9,1,4),mat(0x7a1a1a),0,1.9,0);roof.rotation.y=Math.PI/4;roof.scale.set(1.1,1,0.9);g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(0.8,1,0.1),mat(0xffffff),0,0.5,0.95));
  return g;
}

function initScene(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x87ceeb);scene.fog=new THREE.Fog(0x87ceeb,18,36);
  cameraPersp=new THREE.PerspectiveCamera(45,1,0.1,100);cameraPersp.position.set(9.5,-11,9.5);
  cameraOrtho=new THREE.OrthographicCamera(-7,7,7,-7,0.1,100);cameraOrtho.position.set(0,-0.1,14);cameraOrtho.up.set(0,1,0);cameraOrtho.lookAt(0,0,0);
  camera=cameraPersp;
  const sun=new THREE.DirectionalLight(0xfff6d6,1.4);sun.position.set(5,8,10);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff,0.6));
  const ground=mesh(new THREE.PlaneGeometry(30,30),mat(0x5dbb63,1),0,0,0);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  // board
  boardGroup=new THREE.Group();scene.add(boardGroup);
  const board=mesh(new THREE.CylinderGeometry(5.6,5.6,0.35,48),mat(0x16a34a,0.9),0,0.18,0);boardGroup.add(board);
  for(let i=-2;i<3;i++)for(let j=-2;j<3;j++){const t=mesh(new THREE.BoxGeometry(0.95,0.08,0.95),mat((i+j)%2?0xf5f5dc:0xffffff),i*1.05,0.4,j*1.05);boardGroup.add(t)}
  // pivot
  boardGroup.add(mesh(new THREE.CylinderGeometry(0.45,0.55,1.9,20),mat(0x8b4513),0,1.3,0));
  boardGroup.add(mesh(new THREE.ConeGeometry(0.65,0.7,20),mat(0xffcc00),0,2.6,0));
  // arm
  armGroup=new THREE.Group();armGroup.position.set(0,CONFIG.pivotHeight,0);scene.add(armGroup);
  const armMesh=mesh(new THREE.BoxGeometry(0.22,0.22,CONFIG.armLength),mat(0xa16207),0,0,CONFIG.armLength/2);armGroup.add(armMesh);
  planeGroup=makePlane();planeGroup.position.set(0,0,CONFIG.armLength);armGroup.add(planeGroup);
  // paddles (visual only, updated per frame)
  for(let i=0;i<4;i++){const p=mesh(new THREE.BoxGeometry(1.22,0.5,0.08),mat(new THREE.Color(COLORS[i]),0.6),0,0.6,0);scene.add(p);paddleMeshes.push(p)}
  // chickens clusters
  for(let i=0;i<4;i++){const ang=i*Math.PI/2;for(let t=0;t<3;t++){const ch=makeChicken(t===1?0xffedb8:0xffffff);const off=(t-1)*0.38;ch.position.set((CONFIG.tokenRadius)*Math.sin(ang)+off*Math.cos(ang),0.35,(CONFIG.tokenRadius)*Math.cos(ang)-off*Math.sin(ang));ch.rotation.y=ang;scene.add(ch);chickenMeshes.push({g:ch,player:i,token:t})}}
  // farm decor
  const barn=makeBarn();barn.position.set(0,0,7.5);barn.rotation.y=Math.PI;scene.add(barn);
  const t1=makeTree();t1.position.set(-7,0,6);scene.add(t1);
  const t2=makeTree();t2.position.set(7,0,6);scene.add(t2);
  const t3=makeTree();t3.position.set(-7,0,-6);scene.add(t3);
  const t4=makeTree();t4.position.set(7,0,-6);scene.add(t4);
  controllers=new OrbitControls(cameraPersp,canvas);controllers.enableDamping=true;controllers.target.set(0,1,0);
  resize();window.addEventListener('resize',resize);
  view={setProjection(m){},resetView(){cameraPersp.position.set(9.5,-11,9.5);cameraOrtho.position.set(0,-0.1,14);controllers.target.set(0,1,0);controllers.update()},update(s,dt){updateVisuals(s,dt)}};
  syncCameraUI('persp');
}
let camera=cameraPersp, follow=false;
function resize(){const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;renderer.setSize(w,h,false);cameraPersp.aspect=w/h;cameraPersp.updateProjectionMatrix();const s=Math.max(w,h)/180;cameraOrtho.left=-13*s;cameraOrtho.right=13*s;cameraOrtho.top=13*s;cameraOrtho.bottom=-13*s;cameraOrtho.updateProjectionMatrix()}
function syncCameraUI(mode){$('camera-ortho').setAttribute('aria-pressed',String(!follow&&mode==='ortho'));$('camera-persp').setAttribute('aria-pressed',String(!follow&&mode==='persp'));$('camera-follow').setAttribute('aria-pressed',String(follow))}
function updateVisuals(s,dt){
  // arm rotation: theta around Y, phi elevation
  armGroup.rotation.y=s.theta;
  armGroup.rotation.x=-s.phi; // hinge
  if(planeGroup?.userData.prop)planeGroup.userData.prop.rotation.x+=dt*18;
  // paddles positions
  sim.players.forEach((p,i)=>{const pp=sim.paddlePosition(p);const m=paddleMeshes[i];m.position.set(pp.x,pp.y,pp.z);m.rotation.y=pp.angle;m.rotation.x=p.paddle*0.9});
  // chickens visibility
  chickenMeshes.forEach(c=>{c.g.visible=sim.players[c.player].tokens[c.token]});
  if(follow){const pp=sim.planePosition();cameraPersp.position.lerp(new THREE.Vector3(pp.x+2,-6,pp.z+6),0.08);cameraPersp.lookAt(pp.x,pp.y,pp.z)}
  else if(camera===cameraPersp)controllers.update();
  renderer.render(scene,camera);
}

function toast(t){const el=$('toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1600)}
function beep(freq,dur=0.15){if(!sound||!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=freq;g.gain.setValueAtTime(0.12,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+dur);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur)}
let audioCtx=null;
function ensureAudio(){if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume()}

function syncUI(){
  $('elapsed-time').textContent=elapsedTime(sim.time);
  $('scoreboard').innerHTML=sim.players.map((p,i)=>`<div class="score" style="--color:${COLORS[i]}"><div class="score-head"><span class="score-dot"></span>${playerName(i,bindings)}</div><strong class="life-count">${p.lives}</strong> 마리</div>`).join('');
  $('save-count').textContent=bindings.map(b=>`${b.label} 방어 ${sim.players[b.player].saves}`).join(' · ');
  $('pause').disabled=sim.status==='ready'||sim.status==='finished';$('pause').textContent=sim.status==='paused'?'계속하기':'일시정지';
  for(const b of $('player-controls').children){const p=sim.players[Number(b.dataset.player)];b.disabled=sim.status!=='playing'||(!p.lives&&!sim.settings.practice)}
  $('overlay').hidden=countdownEnd!==null||sim.status==='playing'||sim.status==='paused';
  $('overlay-title').hidden=sim.status==='ready';
  if(sim.status==='paused'){$('overlay-title').textContent='일시정지';$('start').innerHTML='계속하기 <span>↗</span>'}
  else if(sim.status==='finished'){$('overlay-title').textContent=sim.winner===null?'무승부':`${playerName(sim.winner,bindings)} 승리`; $('start').innerHTML=sim.winner===null?`다시 시작`:`${playerName(sim.winner,bindings)} 다시 시작 ↗`; $('overlay').hidden=false}
  else if(sim.status==='ready')$('overlay-title').hidden=true;
}

function setPlayerCount(count){
  count=Number(count);bindings=playerBindings(count);sim.settings.humanPlayers=bindings.map(b=>b.player);
  $('player-controls').style.setProperty('--players',count);
  $('player-controls').innerHTML=bindings.map((b,i)=>`<button class="flap-button" data-player="${b.player}" style="--player-color:${COLORS[b.player]}" ${i===0?'id="flap"':''}>↑<br>${b.label}<small>${b.keyLabel}</small></button>`).join('');
  for(const btn of $('player-mode').querySelectorAll('button'))btn.setAttribute('aria-pressed',String(Number(btn.dataset.playerCount)===count));
  resetRound();syncUI();
}

function start(){
  if(sim.status==='finished'){resetRound()}
  if(sim.status==='ready'){ensureAudio();countdownEnd=performance.now()+3000;$('countdown').hidden=false;sim.pause()}
  else if(sim.status==='paused'){sim.start();ensureAudio()}
  else return;
  syncUI();
}
function pauseToggle(){if(countdownEnd){countdownEnd=null;$('countdown').hidden=true;sim.pause()}else if(sim.status==='playing')sim.pause();else if(sim.status==='paused')sim.start();syncUI()}
function reset(){countdownEnd=null;$('countdown').hidden=true;resetRound();syncUI();start()}
function flap(id){if(sim.press(id)){ensureAudio();beep(660,0.08);const b=$('player-controls').querySelector(`[data-player="${id}"]`);b?.classList.add('pressed');setTimeout(()=>b?.classList.remove('pressed'),110)}}

function bindInputs(){
  $('start').addEventListener('click',start);
  $('restart').addEventListener('click',reset);
  $('pause').addEventListener('click',pauseToggle);
  $('player-controls').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-player]');if(b&&!b.disabled)flap(Number(b.dataset.player))});
  for(const b of $('player-mode').querySelectorAll('button'))b.addEventListener('click',()=>setPlayerCount(b.dataset.playerCount));
  window.addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(e.target.tagName))return;const b=bindings.find(x=>x.code===e.code);if(b&&sim.status==='playing'){e.preventDefault();if(!e.repeat)flap(b.player)}else if(e.code==='KeyP')pauseToggle();else if(e.code==='KeyR')reset();});
  $('camera-ortho').addEventListener('click',()=>{follow=false;camera=cameraOrtho;scene.remove(controllers.domElement);syncCameraUI('ortho');cameraOrtho.lookAt(0,0,0);resize()});
  $('camera-persp').addEventListener('click',()=>{follow=false;camera=cameraPersp;syncCameraUI('persp')});
  $('camera-follow').addEventListener('click',()=>{follow=!follow;camera=cameraPersp;syncCameraUI('follow')});
  $('view-reset').addEventListener('click',()=>{follow=false;camera=cameraPersp;view.resetView?.();syncCameraUI('persp')});
  for(const [id,name] of [['speed','speed'],['force','force'],['gravity','gravity']])$(id).addEventListener('input',e=>{sim.settings[name]=Number(e.target.value);$(name+'-out').textContent=Number(e.target.value).toFixed(1)+'×'});
  $('ai').addEventListener('change',e=>sim.settings.ai=e.target.checked);
  $('practice').addEventListener('change',e=>{sim.settings.practice=e.target.checked;resetRound();syncUI()});
  $('settings-toggle').addEventListener('click',()=>{$('settings').hidden=!$('settings').hidden});
  $('settings-close').addEventListener('click',()=>$('settings').hidden=true);
  $('sound').addEventListener('click',()=>{sound=!sound;$('sound').textContent=sound?'🔊':'🔇'});
  for(const b of document.querySelectorAll('[data-theme-choice]'))b.addEventListener('click',()=>{const m=b.dataset.themeChoice;scene.background=new THREE.Color(m==='dark'?0x0d1c35:m==='snow'?0xeaf2ff:0x87ceeb);scene.fog.color.copy(scene.background);for(const x of document.querySelectorAll('[data-theme-choice]'))x.setAttribute('aria-pressed',String(x===b))});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){countdownEnd=null;$('countdown').hidden=true;sim.pause();syncUI()}});
}

const clock={last:null,acc:0};
function frame(ts){
  requestAnimationFrame(frame);
  if(!clock.last)clock.last=ts;let dt=Math.min((ts-clock.last)/1000,0.1);clock.last=ts;
  if(countdownEnd!==null){
    const sec=Math.ceil((countdownEnd-ts)/1000);
    if(sec<=0){countdownEnd=null;$('countdown').hidden=true;sim.start();beep(880,0.3)}
    else{$('countdown-number').textContent=sec;$('countdown').hidden=false;if(sec!==Math.ceil((countdownEnd-ts+16)/1000))beep(520,0.12)}
  }
  sim.advance(dt);
  for(const ev of sim.drainEvents()){
    if(ev.type==='hit'){beep(880,0.12);toast(`${playerName(ev.player,bindings)} 방어! 🛡️`)}
    if(ev.type==='loss'){beep(220,0.25);toast(`${playerName(ev.player,bindings)} 닭 잡혔어요! 🐔💨`)}
    if(ev.type==='press')beep(440,0.06);
  }
  syncUI();
  if(renderer)view.update(sim,sim.status==='playing'?dt:0,dt);
}

try{
  initScene();
  setPlayerCount(1);
  bindInputs();
  syncUI();
  window.__louie={sim};
  requestAnimationFrame(frame);
}catch(e){console.error(e);$('error').hidden=false;$('error').textContent='3D 게임판을 열지 못했습니다: '+e.message}
