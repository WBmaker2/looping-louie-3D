import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Simulation, CONFIG } from './physics.js';
import { FrameClock } from './frame-clock.js';
import { GameAudio } from './game-audio.js';
import { createRoundState } from './round-state.js';
import { playerBindings, playerName, elapsedTime } from './player-mode.js';
import { UPDATE_HISTORY } from './update-history.js';

const $=id=>document.getElementById(id);
const COLORS=['#ef4444','#3b82f6','#22c55e','#f59e0b'];
const canvas=$('canvas');

let renderer, scene, cameraPersp, cameraOrtho, controllers, view=null;
let boardGroup, armGroup, pitchGroup, planeGroup, paddleMeshes=[], chickenMeshes=[];
let sim=new Simulation();
let prevAngle=null;
function resetRound(){const s=createRoundState(prevAngle);prevAngle=s.startAngle;sim.reset(s)}
resetRound();
let bindings=playerBindings(1);
const isHuman=id=>bindings.some(b=>b.player===id);
let countdownEnd=null, sound=true;
let hudMinimized=false, hudManuallyExpanded=false;
function setHudMinimized(min){
  hudMinimized=min;
  const hud=document.querySelector('.hud');
  hud.classList.toggle('hud-minimized',min);
  const t=$('hud-toggle');
  if(t){t.textContent=min?'+':'−';t.setAttribute('aria-expanded',String(!min))}
  const mini=$('mini-scores'); if(mini) mini.hidden=!min;
  // mini-scores visibility driven by CSS; update text in syncUI
}
function updateHudForStatus(){
  const shouldMin = sim.status==='playing' && countdownEnd===null && !hudManuallyExpanded;
  if(sim.status!=='playing'){hudManuallyExpanded=false; setHudMinimized(false);}
  else {setHudMinimized(shouldMin)}
}

function mat(color,rough=0.8){return new THREE.MeshStandardMaterial({color,roughness:rough,metalness:0.05})}
function mesh(geo,material,x=0,y=0,z=0){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m}

function makeChicken(color=0xffffff){
  const g=new THREE.Group();
  const body=mesh(new THREE.SphereGeometry(0.28,22,18),mat(color,0.6),0,0.28,0);body.scale.set(1,0.95,1.25);g.add(body);
  const chest=mesh(new THREE.SphereGeometry(0.18,16,12),mat(0xfff0d5,0.6),0,0.24,0.18);chest.scale.set(1,0.9,0.8);g.add(chest);
  const head=mesh(new THREE.SphereGeometry(0.17,18,14),mat(color,0.55),0,0.58,0.14);g.add(head);
  const beak=mesh(new THREE.ConeGeometry(0.07,0.18,12),mat(0xff8c00,0.5),0,0.54,0.34);beak.rotation.x=Math.PI/2;g.add(beak);
  const comb=mesh(new THREE.SphereGeometry(0.09,12,10),mat(0xef4444,0.45),0,0.75,0.1);comb.scale.set(0.85,1.5,0.5);g.add(comb);
  const comb2=mesh(new THREE.SphereGeometry(0.05,10,8),mat(0xdc2626,0.45),0,0.72,0.02);comb2.scale.set(0.8,1.2,0.5);g.add(comb2);
  const wattle=mesh(new THREE.SphereGeometry(0.05,10,8),mat(0xdc2626,0.45),0,0.43,0.26);wattle.scale.set(0.8,1.2,0.6);g.add(wattle);
  const tail=mesh(new THREE.ConeGeometry(0.16,0.34,12),mat(color,0.6),0,0.45,-0.3);tail.rotation.x=-0.65;g.add(tail);
  const tail2=mesh(new THREE.ConeGeometry(0.12,0.28,10),mat(0xf3f0e8,0.6),-0.08,0.5,-0.32);tail2.rotation.x=-0.8;g.add(tail2);
  const wingL=mesh(new THREE.SphereGeometry(0.16,14,10),mat(0xefe9dd,0.65),-0.22,0.3,-0.02);wingL.scale.set(0.35,0.9,1.1);g.add(wingL);
  const wingR=wingL.clone();wingR.position.x=0.22;g.add(wingR);
  const eyeL=mesh(new THREE.SphereGeometry(0.035,10,8),mat(0x111111,0.2),-0.09,0.63,0.28);const eyeR=eyeL.clone();eyeR.position.x=0.09;g.add(eyeL,eyeR);
  const glintL=mesh(new THREE.SphereGeometry(0.012,8,8),mat(0xffffff,0.2),-0.07,0.65,0.31);const glintR=glintL.clone();glintR.position.x=0.11;g.add(glintL,glintR);
  const legL=mesh(new THREE.CylinderGeometry(0.02,0.02,0.14,8),mat(0xf59e0b,0.6),-0.09,0.07,0);const legR=legL.clone();legR.position.x=0.09;g.add(legL,legR);
  const footL=mesh(new THREE.BoxGeometry(0.1,0.02,0.16),mat(0xf59e0b,0.6),-0.09,0.01,0.03);const footR=footL.clone();footR.position.x=0.09;g.add(footL,footR);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true}});
  return g;
}
function makePlane(){
  const g=new THREE.Group();
  const fus=mesh(new THREE.CapsuleGeometry(0.28,0.72,8,18),mat(0xef4444,0.38),0,0,0);fus.rotation.z=Math.PI/2;g.add(fus);
  const belly=mesh(new THREE.CapsuleGeometry(0.24,0.6,6,14),mat(0xfff7ed,0.5),0,-0.08,0);belly.rotation.z=Math.PI/2;g.add(belly);
  const wing=mesh(new THREE.BoxGeometry(0.18,0.07,1.65),mat(0xffcc00,0.4),0,0.03,0);g.add(wing);
  const wingTipL=mesh(new THREE.BoxGeometry(0.18,0.07,0.25),mat(0xef4444,0.4),0,0.03,0.82);const wingTipR=wingTipL.clone();wingTipR.position.z=-0.82;g.add(wingTipL,wingTipR);
  const strutL=mesh(new THREE.CylinderGeometry(0.02,0.02,0.35,8),mat(0x8b4513,0.5),0,0.12,0.35);strutL.rotation.x=0.5;const strutR=strutL.clone();strutR.position.z=-0.35;g.add(strutL,strutR);
  const tailWing=mesh(new THREE.BoxGeometry(0.14,0.06,0.72),mat(0xffcc00,0.4),-0.48,0.14,0);g.add(tailWing);
  const tailFin=mesh(new THREE.BoxGeometry(0.08,0.38,0.26),mat(0x3b82f6,0.4),-0.48,0.26,0);g.add(tailFin);
  const cockpit=mesh(new THREE.SphereGeometry(0.19,16,12),mat(0x9fd8ff,0.15),0.08,0.19,0);cockpit.scale.set(1.25,0.75,1);g.add(cockpit);
  const frame=mesh(new THREE.TorusGeometry(0.16,0.02,8,16),mat(0x8b4513,0.4),0.08,0.2,0);frame.rotation.y=Math.PI/2;g.add(frame);
  const pilotHead=mesh(new THREE.SphereGeometry(0.11,14,12),mat(0xffd9b3,0.55),0.02,0.28,0);g.add(pilotHead);
  const scarf=mesh(new THREE.TorusGeometry(0.09,0.03,8,12),mat(0xf59e0b,0.5),0.02,0.24,0);scarf.rotation.x=Math.PI/2;g.add(scarf);
  const hat=mesh(new THREE.CylinderGeometry(0.14,0.16,0.09,16),mat(0x7c3aed,0.5),0.02,0.38,0);g.add(hat);
  const hatTop=mesh(new THREE.SphereGeometry(0.13,12,8),mat(0x7c3aed,0.5),0.02,0.43,0);hatTop.scale.set(1,0.4,1);g.add(hatTop);
  const prop=mesh(new THREE.BoxGeometry(0.03,0.75,0.09),mat(0x333333,0.4),0.58,0,0);g.add(prop);
  const hub=mesh(new THREE.SphereGeometry(0.07,12,10),mat(0xffe066,0.35),0.58,0,0);g.add(hub);
  const wheelL=mesh(new THREE.CylinderGeometry(0.12,0.12,0.06,14),mat(0x111111,0.5),-0.05,-0.32,0.28);wheelL.rotation.x=Math.PI/2;const wheelR=wheelL.clone();wheelR.position.z=-0.28;g.add(wheelL,wheelR);
  const gearL=mesh(new THREE.CylinderGeometry(0.02,0.02,0.25,8),mat(0x999999,0.4),-0.05,-0.18,0.28);const gearR=gearL.clone();gearR.position.z=-0.28;g.add(gearL,gearR);
  const nose=mesh(new THREE.ConeGeometry(0.11,0.16,12),mat(0xffe066,0.35),0.62,0,0);nose.rotation.z=-Math.PI/2;g.add(nose);
  const exhaust=mesh(new THREE.CylinderGeometry(0.04,0.04,0.18,10),mat(0x777777,0.35),-0.1,0.15,0.2);exhaust.rotation.x=Math.PI/2;g.add(exhaust);
  g.userData.prop=prop;
  return g;
}
function makeTree(){
  const g=new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.12,0.2,1.3,12),mat(0x8b4513,0.75),0,0.65,0));
  g.add(mesh(new THREE.SphereGeometry(0.95,18,14),mat(0x228b45,0.7),0,1.7,0));
  g.add(mesh(new THREE.SphereGeometry(0.62,14,12),mat(0x3cb371,0.65),0.55,1.3,0.25));
  g.add(mesh(new THREE.SphereGeometry(0.5,12,10),mat(0x2e8b57,0.65),-0.5,1.35,-0.2));
  for(let i=0;i<5;i++){const a=i*1.2;g.add(mesh(new THREE.SphereGeometry(0.12,10,8),mat(0xe11d48,0.5),Math.cos(a)*0.65,1.55+Math.sin(a)*0.3,Math.sin(a)*0.65))}
  return g;
}
function makeBarn(){
  const g=new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(2.5,1.5,1.9),mat(0xdc2626,0.65),0,0.75,0));
  const roof=mesh(new THREE.ConeGeometry(2.0,1.1,4),mat(0x7a1a1a,0.6),0,2.0,0);roof.rotation.y=Math.PI/4;roof.scale.set(1.15,1,0.95);g.add(roof);
  g.add(mesh(new THREE.BoxGeometry(0.9,1.1,0.08),mat(0xffffff,0.6),0,0.55,0.97));
  g.add(mesh(new THREE.BoxGeometry(0.08,1.1,0.02),mat(0xdc2626,0.6),0,0.55,1.02));
  g.add(mesh(new THREE.BoxGeometry(0.9,0.08,0.02),mat(0xdc2626,0.6),0,0.55,1.02));
  const win=mesh(new THREE.BoxGeometry(0.4,0.35,0.06),mat(0xfff8b0,0.3),0.8,1.0,0.97);g.add(win);
  const hay=mesh(new THREE.CylinderGeometry(0.35,0.35,0.9,14),mat(0xf5c542,0.8),-1.4,0.35,0.4);hay.rotation.z=Math.PI/2;g.add(hay);
  const fencePost=mesh(new THREE.BoxGeometry(0.1,0.5,0.1),mat(0x8b4513,0.7),1.5,0.25,0.8);g.add(fencePost);
  return g;
}
function makeSpoonPaddle(colorHex){
  const color=parseInt(colorHex.slice(1),16);
  const pivot=new THREE.Group();
  const teeter=new THREE.Group();
  pivot.add(teeter);
  teeter.position.set(0,0,0);
  // outer hinge base (touching board)
  pivot.add(mesh(new THREE.CylinderGeometry(0.26,0.3,0.12,16),mat(0x6b7280,0.4),0,0.06,0));
  pivot.add(mesh(new THREE.CylinderGeometry(0.1,0.1,0.22,14),mat(0x9ca3af,0.35),0,0.16,0));
  // handle arm (inner length ~1.22)
  const arm=mesh(new THREE.BoxGeometry(0.22,0.07,1.22),mat(color,0.45),0,0.14,0.61);teeter.add(arm);
  teeter.add(mesh(new THREE.BoxGeometry(0.26,0.05,0.3),mat(0xffffff,0.45),0,0.14,1.05));
  // spoon scoop: flattened dish + rim, tip at 1.22
  const scoop=mesh(new THREE.CylinderGeometry(0.42,0.34,0.07,22),mat(color,0.35),0,0.14,1.0);teeter.add(scoop);
  const rim=mesh(new THREE.TorusGeometry(0.4,0.035,8,24),mat(0xffffff,0.4),0,0.17,1.0);rim.rotation.x=Math.PI/2;teeter.add(rim);
  const dish=mesh(new THREE.SphereGeometry(0.32,16,10),mat(0xffffff,0.35),0,0.16,1.0);dish.scale.set(1,0.22,1);teeter.add(dish);
  const tip=mesh(new THREE.SphereGeometry(0.09,12,10),mat(color,0.4),0,0.2,1.35);teeter.add(tip);
  // outer press lever extends opposite direction (like boardgame button)
  const press=mesh(new THREE.BoxGeometry(0.45,0.09,0.5),mat(0xef4444,0.45),0,0.14,-0.28);teeter.add(press);
  const pressTop=mesh(new THREE.CylinderGeometry(0.16,0.18,0.08,14),mat(0xfca5a5,0.4),0,0.2,-0.28);teeter.add(pressTop);
  // spring zigzag visual
  for(let i=0;i<3;i++){const coil=mesh(new THREE.TorusGeometry(0.12,0.02,6,12),mat(0x6b7280,0.35),0,0.08+i*0.02,0.1);coil.rotation.x=Math.PI/2;pivot.add(coil)}
  pivot.userData.teeter=teeter;
  return pivot;
}

function initScene(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x87ceeb);scene.fog=new THREE.Fog(0x87ceeb,30,60);
  // Start view matching the screenshot: south elevated perspective (~32°)
  cameraPersp=new THREE.PerspectiveCamera(40,1,0.1,140);cameraPersp.position.set(0,9,15);
  camera=cameraPersp;
  const sun=new THREE.DirectionalLight(0xfff6d6,1.5);sun.position.set(6,12,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-12;sun.shadow.camera.right=12;sun.shadow.camera.top=12;sun.shadow.camera.bottom=-12;scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff,0.55));
  const hemi=new THREE.HemisphereLight(0xbfe3ff,0x4a7c59,0.5);scene.add(hemi);
  const ground=mesh(new THREE.PlaneGeometry(34,34),mat(0x5dbb63,0.95),0,0,0);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  // board with rim + outer ring
  boardGroup=new THREE.Group();scene.add(boardGroup);
  const board=mesh(new THREE.CylinderGeometry(5.6,5.6,0.35,64),mat(0x16a34a,0.85),0,0.18,0);boardGroup.add(board);
  const rim=mesh(new THREE.TorusGeometry(5.6,0.13,10,64),mat(0x8b4513,0.55),0,0.35,0);rim.rotation.x=Math.PI/2;boardGroup.add(rim);
  const ring1=mesh(new THREE.TorusGeometry(5.05,0.04,8,64),mat(0xffffff,0.6),0,0.36,0);ring1.rotation.x=Math.PI/2;boardGroup.add(ring1);
  for(let i=-2;i<3;i++)for(let j=-2;j<3;j++){const t=mesh(new THREE.BoxGeometry(0.95,0.1,0.95),mat((i+j)%2?0xf5f5dc:0xffffff,0.65),i*1.05,0.41,j*1.05);boardGroup.add(t)}
  // center badge
  boardGroup.add(mesh(new THREE.CylinderGeometry(0.55,0.6,0.1,24),mat(0xffcc00,0.4),0,0.46,0));
  boardGroup.add(mesh(new THREE.CylinderGeometry(0.32,0.32,0.16,20),mat(0xef4444,0.4),0,0.5,0));
  // pivot
  boardGroup.add(mesh(new THREE.CylinderGeometry(0.45,0.55,1.9,20),mat(0x8b4513),0,1.3,0));
  boardGroup.add(mesh(new THREE.ConeGeometry(0.65,0.7,20),mat(0xffcc00),0,2.6,0));
  // arm: nested yaw → pitch so height never depends on orbit angle
  armGroup=new THREE.Group();armGroup.position.set(0,CONFIG.pivotHeight,0);scene.add(armGroup);
  pitchGroup=new THREE.Group();armGroup.add(pitchGroup);
  const armMesh=mesh(new THREE.BoxGeometry(0.22,0.22,CONFIG.armLength),mat(0xa16207),0,0,CONFIG.armLength/2);pitchGroup.add(armMesh);
  planeGroup=makePlane();planeGroup.position.set(0,0,CONFIG.armLength);pitchGroup.add(planeGroup);
  // safety: keep the plane mesh bottom above the board even at low rest angles
  planeGroup.position.y=0.12; // lift mesh ~1cm above the arm line so propellers/wheels clear the board
  // spoon paddles (스푼처럼 기울어지는 실제 보드게임 지렛대)
  for(let i=0;i<4;i++){const sp=makeSpoonPaddle(COLORS[i]);scene.add(sp);paddleMeshes.push(sp)}
  // chickens clusters — feet on the board top (0.46) so visual ↔ physics heights match
  for(let i=0;i<4;i++){const ang=i*Math.PI/2;for(let t=0;t<3;t++){const ch=makeChicken(t===1?0xffedb8:0xffffff);const off=(t-1)*0.38;ch.position.set((CONFIG.tokenRadius)*Math.sin(ang)+off*Math.cos(ang),0.46,(CONFIG.tokenRadius)*Math.cos(ang)-off*Math.sin(ang));ch.rotation.y=ang;scene.add(ch);chickenMeshes.push({g:ch,player:i,token:t})}}
  // farm decor: detailed fence, hay, flowers, extra barn props
  const barn=makeBarn();barn.position.set(0,0,7.5);barn.rotation.y=Math.PI;scene.add(barn);
  const t1=makeTree();t1.position.set(-7,0,6);scene.add(t1);
  const t2=makeTree();t2.position.set(7,0,6);scene.add(t2);
  const t3=makeTree();t3.position.set(-7,0,-6);scene.add(t3);
  const t4=makeTree();t4.position.set(7,0,-6);scene.add(t4);
  for(let k=-2;k<=2;k++){const post=mesh(new THREE.BoxGeometry(0.12,0.9,0.12),mat(0x8b4513,0.7),k*1.2,0.45,6.2);scene.add(post);const rail=mesh(new THREE.BoxGeometry(1.2,0.07,0.07),mat(0xa16207,0.7),k*1.2+0.6,0.55,6.2);scene.add(rail)}
  const hay1=mesh(new THREE.CylinderGeometry(0.45,0.45,0.9,18),mat(0xf5c542,0.85),-5.5,0.45,-5.5);hay1.rotation.z=Math.PI/2;scene.add(hay1);
  const hay2=hay1.clone();hay2.position.set(5.5,0.45,-5.5);scene.add(hay2);
  for(let i=0;i<8;i++){const f=mesh(new THREE.SphereGeometry(0.14,10,8),mat(i%2?0xffffff:0xf472b6,0.6),-6+i*1.7,0.16,-6.8);scene.add(f)}
  controllers=new OrbitControls(cameraPersp,canvas);controllers.enableDamping=true;controllers.target.set(0,0.6,0);controllers.maxPolarAngle=Math.PI*0.45;
  resize();window.addEventListener('resize',resize);
  view={resetView(){cameraPersp.position.set(0,9,15);controllers.target.set(0,0.6,0);controllers.update()},update(s,dt){updateVisuals(s,dt)}};
}
let camera=cameraPersp;
function resize(){const w=canvas.clientWidth||innerWidth,h=canvas.clientHeight||innerHeight;renderer.setSize(w,h,false);cameraPersp.aspect=w/h;cameraPersp.updateProjectionMatrix()}
function updateVisuals(s,dt){
  // arm: yaw on the outer group, pitch on the inner group (height independent of yaw)
  armGroup.rotation.y=s.theta;
  pitchGroup.rotation.x=-s.phi; // hinge
  // absolute floor guard (visual match to physics MIN_PLANE_Y)
  const pp0=sim.planePosition();
  if(pp0.y<1.07){pitchGroup.rotation.x=-Math.asin(Math.max(-1,Math.min(1,(1.07-CONFIG.pivotHeight)/CONFIG.armLength)))}
  if(planeGroup?.userData.prop)planeGroup.userData.prop.rotation.x+=dt*18;
  // spoon paddles: hinge at outer edge, inner spoon tip rises (pressed outer goes down)
  sim.players.forEach((p,i)=>{
    const g=paddleMeshes[i]; if(!g)return;
    const angle=p.angle+CONFIG.paddleOffset;
    const outerR=CONFIG.paddlePivotRadius;
    const hx=Math.sin(angle)*outerR, hz=Math.cos(angle)*outerR;
    g.position.set(hx,CONFIG.paddlePivotHeight,hz);
    g.rotation.set(0,0,0);
    g.rotation.y=angle+Math.PI; // local +Z points to board centre
    const lift=p.paddle; // 0..0.85 rad
    const t=g.userData.teeter;
    if(t){
      // inner spoon goes up, outer press goes down (지렛대)
      t.rotation.x=-lift; // rotates +Z tip upward
      // visual accent: tip glow while rising fast
      t.children.forEach(c=>{if(c.material&&c.geometry&&c.geometry.type==='TorusGeometry')c.material.emissive=new THREE.Color(0x442200)});
    }
  });
  // chickens visibility
  chickenMeshes.forEach(c=>{c.g.visible=sim.players[c.player].tokens[c.token]});
  controllers.update();
  renderer.render(scene,camera);
}

function toast(t){const el=$('toast');el.textContent=t;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1600)}
function beep(freq,dur=0.15){if(!sound||!audioCtx)return;const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=freq;g.gain.setValueAtTime(0.12,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(0.001,audioCtx.currentTime+dur);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur)}
let audioCtx=null;
function ensureAudio(){if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume()}

function syncUI(){
  $('elapsed-time').textContent=elapsedTime(sim.time);
  updateHudForStatus();
  $('scoreboard').innerHTML=sim.players.map((p,i)=>`<div class="score" style="--color:${COLORS[i]}"><div class="score-head"><span class="score-dot"></span>${playerName(i,bindings)}</div><strong class="life-count">${p.lives}</strong> 마리</div>`).join('');
  const mini=$('mini-scores'); if(mini) mini.textContent=sim.players.map(p=>`${playerName(p.id,bindings)} ${p.lives}`).join(' · ');
  $('save-count').textContent=bindings.map(b=>`${b.label} 방어 ${sim.players[b.player].saves}`).join(' · ');
  const canPause=sim.status==='playing'||sim.status==='paused'||countdownEnd!==null;
  $('pause').disabled=!canPause;$('pause').textContent=sim.status==='paused'?'계속하기':'일시정지';
  for(const b of $('player-controls').children){const p=sim.players[Number(b.dataset.player)];b.disabled=sim.status!=='playing'||(!p.lives&&!sim.settings.practice)}
  $('overlay').hidden=countdownEnd!==null||sim.status==='playing';
  $('overlay-title').hidden=sim.status==='ready';
  if(sim.status==='paused'){$('overlay-title').textContent='일시정지';$('start').innerHTML='계속하기 <span>↗</span>'}
  else if(sim.status==='finished'){$('overlay-title').textContent=sim.winner===null?'무승부':`${playerName(sim.winner,bindings)} 승리`; $('start').innerHTML=sim.winner===null?`다시 시작`:`${playerName(sim.winner,bindings)} 다시 시작 ↗`; $('overlay').hidden=false}
  else if(sim.status==='ready'){$('overlay-title').hidden=true;$('start').innerHTML='게임 시작 <span>↗</span>'}
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
function pauseToggle(){
  if(countdownEnd!==null){cancelCountdown();sim.pause();toast('시작이 취소됐어요');syncUI();return}
  if(sim.status==='playing'){sim.pause();toast('일시정지했어요 ⏸')}
  else if(sim.status==='paused'){sim.start();toast('계속해요 ▶')}
  else {syncUI();return}
  syncUI();
}
function reset(){
  // 다시시작: 게임 진행 중에도 1인/2인/3인 선택 메뉴로 돌아가 다음 게임을 준비
  cancelCountdown();
  resetRound();
  syncUI();
  toast('메뉴로 돌아갔어요 – 인원을 고르고 시작을 눌러주세요');
  $('start').focus({preventScroll:true});
}
function flap(id){if(sim.press(id)){ensureAudio();beep(660,0.08);const b=$('player-controls').querySelector(`[data-player="${id}"]`);b?.classList.add('pressed');setTimeout(()=>b?.classList.remove('pressed'),110)}}

function bindInputs(){
  $('start').addEventListener('click',start);
  $('restart').addEventListener('click',reset);
  $('pause').addEventListener('pointerdown',e=>{e.preventDefault();pauseToggle()});
  $('player-controls').addEventListener('pointerdown',e=>{const b=e.target.closest('[data-player]');if(b&&!b.disabled)flap(Number(b.dataset.player))});
  for(const b of $('player-mode').querySelectorAll('button'))b.addEventListener('click',()=>setPlayerCount(b.dataset.playerCount));
  window.addEventListener('keydown',e=>{if(['INPUT','SELECT'].includes(e.target.tagName))return;const b=bindings.find(x=>x.code===e.code);if(b&&sim.status==='playing'){e.preventDefault();if(!e.repeat)flap(b.player)}else if(e.code==='KeyP')pauseToggle();else if(e.code==='KeyR')reset();});
  $('view-reset').addEventListener('click',()=>{view.resetView?.()});
  for(const [id,name] of [['speed','speed'],['force','force'],['gravity','gravity']])$(id).addEventListener('input',e=>{sim.settings[name]=Number(e.target.value);$(name+'-out').textContent=Number(e.target.value).toFixed(1)+'×'});
  $('ai').addEventListener('change',e=>sim.settings.ai=e.target.checked);
  $('practice').addEventListener('change',e=>{sim.settings.practice=e.target.checked;resetRound();syncUI()});
  $('hud-toggle').addEventListener('click',()=>{
    const next=!hudMinimized;
    hudManuallyExpanded = sim.status==='playing' && !next; // expanding during play is manual override
    setHudMinimized(next);
  });
  $('update-history-btn').addEventListener('click',()=>openUpdateHistory());
  $('update-history-close').addEventListener('click',()=>$('update-history-dialog').close());
  $('settings-toggle').addEventListener('click',()=>{$('settings').hidden=!$('settings').hidden});
  $('settings-close').addEventListener('click',()=>$('settings').hidden=true);
  $('sound').addEventListener('click',()=>{sound=!sound;$('sound').textContent=sound?'🔊':'🔇'});
  for(const b of document.querySelectorAll('[data-theme-choice]'))b.addEventListener('click',()=>{const m=b.dataset.themeChoice;scene.background=new THREE.Color(m==='dark'?0x0d1c35:m==='snow'?0xeaf2ff:0x87ceeb);scene.fog.color.copy(scene.background);for(const x of document.querySelectorAll('[data-theme-choice]'))x.setAttribute('aria-pressed',String(x===b))});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelCountdown();sim.pause();syncUI()}});
}

function openUpdateHistory(){
  $('update-history-list').innerHTML=UPDATE_HISTORY.map(entry=>`<div><p class="update-date">📅 ${entry.date}</p><ul class="update-items">${entry.items.map(it=>`<li>${it}</li>`).join('')}</ul></div>`).join('');
  $('update-history-dialog').showModal();
  $('update-history-close').focus();
}

const clock={last:null,acc:0};
function cancelCountdown(){countdownEnd=null;$('countdown').hidden=true}
function frame(ts){
  requestAnimationFrame(frame);
  if(!clock.last)clock.last=ts;let dt=Math.min((ts-clock.last)/1000,0.1);clock.last=ts;
  if(countdownEnd!==null){
    const now=performance.now();
    const sec=Math.ceil((countdownEnd-now)/1000);
    if(sec<=0){cancelCountdown();sim.start();beep(880,0.3)}
    else{$('countdown-number').textContent=sec;$('countdown').hidden=false}
  } else if(!$('countdown').hidden){$('countdown').hidden=true}
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
  window.__louie={sim,openUpdateHistory};
  requestAnimationFrame(frame);
}catch(e){console.error(e);$('error').hidden=false;$('error').textContent='3D 게임판을 열지 못했습니다: '+e.message}
