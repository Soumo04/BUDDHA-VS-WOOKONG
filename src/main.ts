/**
 * main.ts — M2 boot + orchestration.
 * Wires: Three.js renderer, scene, all entities, AI, VFX, HUD, combat.
 */
import * as THREE from 'three';
// @ts-expect-error — CSS module no declarations needed
import './style.css';

import { GameLoop }       from '@core/GameLoop';
import { InputManager }   from '@core/InputManager';
import { AudioManager }   from '@core/AudioManager';
import { EventBus }       from '@core/EventBus';
import { ObjectPool }     from '@core/ObjectPool';

import { Arena }          from '@scene/Arena';
import { SceneLighting }  from '@scene/Lighting';
import { GameCamera }     from '@scene/Camera';

import { Wukong }         from '@entities/Wukong';
import type { WukongConfig } from '@entities/Wukong';
import { Buddha }         from '@entities/Buddha';

import { HitDetector }    from '@combat/HitDetector';
import { DamageNumbers }  from '@combat/DamageNumbers';

import { TelegraphFX }    from '@vfx/TelegraphFX';
import { HitFX }          from '@vfx/HitFX';
import { ArenaFX }        from '@vfx/ArenaFX';

import { HUD }            from '@ui/HUD';
import { ScreenManager }  from '@ui/ScreenManager';

/* ================================================================== */
/* 1. Renderer                                                          */
/* ================================================================== */

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace  = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog   = new THREE.Fog(0x1a0d1f, 60, 350);

/* ================================================================== */
/* 2. Core singletons                                                   */
/* ================================================================== */

const bus     = new EventBus();
const input   = new InputManager();
const audio   = new AudioManager();
const screens = new ScreenManager(audio);
screens.show('loading');

/* ================================================================== */
/* 3. Projectile pool (shared by BossAI)                               */
/* ================================================================== */

function createProjectileMesh(): THREE.Mesh {
  const geo = new THREE.TorusGeometry(0.35, 0.08, 8, 20);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8080ff,
    emissive: new THREE.Color(0x4040ff),
    emissiveIntensity: 1.5,
    roughness: 0.2,
    metalness: 0.4,
  });
  const m = new THREE.Mesh(geo, mat);
  m.visible = false;
  return m;
}

const projectilePool = new ObjectPool<THREE.Mesh>(createProjectileMesh, { prewarm: 20 });

/* ================================================================== */
/* 4. Config                                                            */
/* ================================================================== */

screens.setLoadingProgress(0.1, 'Reading the sutras…');

let wukongCfg: WukongConfig;
let buddhaCfg: { boss: { maxHp: number; phase2Threshold: number; phase3Threshold: number } };

async function loadConfigs(): Promise<void> {
  const [wRes, bRes] = await Promise.all([
    fetch('/assets/config/wukong.json'),
    fetch('/assets/config/buddha.json'),
  ]);
  wukongCfg = await wRes.json() as WukongConfig;
  buddhaCfg = await bRes.json() as typeof buddhaCfg;
}

/* ================================================================== */
/* 5. Scene / entity construction — lazy                               */
/* ================================================================== */

let camera:      GameCamera;
let arena:       Arena;
let lighting:    SceneLighting;
let wukong:      Wukong;
let buddha:      Buddha;
let hitDetector: HitDetector;
let hud:         HUD;
let arenaFX:     ArenaFX;
let telegraphFX: TelegraphFX;
let hitFX:       HitFX;
let dmgNumbers:  DamageNumbers;
let loop:        GameLoop;
let isPaused = false;

function buildScene(): void {
  camera      = new GameCamera(window.innerWidth / window.innerHeight);
  lighting    = new SceneLighting(scene);
  arena       = new Arena(scene);
  arenaFX     = new ArenaFX(scene);
  telegraphFX = new TelegraphFX(scene);
  hitFX       = new HitFX(scene);
  dmgNumbers  = new DamageNumbers();
  hud         = new HUD(bus);

  const b = buddhaCfg.boss;

  // Player
  wukong = new Wukong(
    wukongCfg,
    input,
    scene,
    () => camera.cameraYaw,
    hitFX,
  );

  // Boss
  buddha = new Buddha(scene, b.maxHp, b.phase2Threshold, b.phase3Threshold);

  // Wire boss AI (async — loads attack patterns from JSON)
  buddha.initAI(
    telegraphFX,
    hitFX,
    bus,
    projectilePool,
    () => wukong.position.clone(),
  );

  // Hit detection
  hitDetector = new HitDetector(scene, hitFX, dmgNumbers);
  hitDetector.listenToBus(bus);

  // Lighting phase
  bus.on('boss:phase_change', (data: unknown) => {
    const { phase } = data as { phase: 1 | 2 | 3 };
    lighting.setPhase(phase);
  });

  // Clone VFX (greybox — spawn ghost clones)
  bus.on('player:clone', (data: unknown) => {
    spawnClones(data as { position: { x:number; y:number; z:number }; count: number; duration: number });
  });

  // Win / lose
  bus.on('boss:died',   () => { setTimeout(() => endGame('victory'), 1400); });
  bus.on('player:died', () => { setTimeout(() => endGame('defeat'),   900); });
}

/* ================================================================== */
/* 6. Clone VFX (greybox ghost shadows)                                */
/* ================================================================== */

const cloneMeshes: THREE.Mesh[] = [];

function spawnClones(data: { position: { x:number; y:number; z:number }; count: number; duration: number }): void {
  // Clean old
  for (const m of cloneMeshes) { scene.remove(m); }
  cloneMeshes.length = 0;

  for (let i = 0; i < data.count; i++) {
    const angle = (i / data.count) * Math.PI * 2;
    const geo = new THREE.CylinderGeometry(0.3, 0.25, 1.6, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xff8533, transparent: true, opacity: 0.35,
      emissive: new THREE.Color(0xffa000), emissiveIntensity: 0.5,
    });
    const clone = new THREE.Mesh(geo, mat);
    clone.position.set(
      data.position.x + Math.cos(angle) * 2.5,
      0.8,
      data.position.z + Math.sin(angle) * 2.5,
    );
    scene.add(clone);
    cloneMeshes.push(clone);
  }

  setTimeout(() => {
    for (const m of cloneMeshes) { scene.remove(m); }
    cloneMeshes.length = 0;
  }, data.duration * 1000);
}

/* ================================================================== */
/* 7. Game loop                                                         */
/* ================================================================== */

function update(dt: number, _elapsed: number): void {
  if (isPaused) return;

  input.poll();

  // Pause toggle
  if (input.isJustPressed('PAUSE') && screens.active === 'fight') {
    isPaused = true;
    screens.show('pause');
    return;
  }

  // Entity updates
  wukong.update(dt, bus);
  buddha.update(dt, bus);

  // VFX updates
  telegraphFX.update(dt);
  hitFX.update(dt);
  arenaFX.update(dt);
  dmgNumbers.update(dt);

  // Hit resolution (needs camera for screen-space damage numbers)
  hitDetector.resolve(wukong, buddha, bus, camera.camera);

  // Scene systems
  arena.update(dt);
  lighting.update(dt);

  // Camera
  camera.update(
    dt,
    { position: wukong.position, height: 1.4 },
    { position: buddha.position, height: 2.5 },
    input,
  );

  // HUD
  hud.update(dt, wukong, buddha);

  // Lock-on reticle
  if (camera.isLockedOn) {
    const bossScreen = buddha.position.clone()
      .add(new THREE.Vector3(0, 4, 0))
      .project(camera.camera);
    hud.updateLockOn(
      true,
      (bossScreen.x * 0.5 + 0.5) * window.innerWidth,
      (-bossScreen.y * 0.5 + 0.5) * window.innerHeight,
    );
  } else {
    hud.updateLockOn(false, 0, 0);
  }
}

function render(): void {
  renderer.render(scene, camera.camera);
}

/* ================================================================== */
/* 8. Game flow                                                         */
/* ================================================================== */

function startGame(): void {
  audio.unlock();
  isPaused = false;
  screens.show('fight');
  hud.show();
  if (!loop) loop = new GameLoop(update, render);
  loop.start();
}

function endGame(result: 'victory' | 'defeat'): void {
  loop?.stop();
  screens.show(result);
}

function returnToTitle(): void {
  loop?.stop();
  screens.show('title');
}

/* ================================================================== */
/* 9. UI callbacks                                                      */
/* ================================================================== */

function bindUI(): void {
  document.getElementById('btn-start')?.addEventListener('click', async () => {
    audio.unlock();
    screens.show('loading');
    screens.setLoadingProgress(0.5, 'Summoning the Tathagata…');
    await delay(400);
    buildScene();
    screens.setLoadingProgress(1.0, 'The battle begins!');
    await delay(600);
    startGame();
  });

  document.getElementById('btn-restart-victory')?.addEventListener('click', () => returnToTitle());
  document.getElementById('btn-restart-defeat')?.addEventListener('click', () => returnToTitle());

  document.getElementById('btn-resume')?.addEventListener('click', () => {
    isPaused = false;
    screens.show('fight');
    if (!isMobile()) canvas.requestPointerLock?.();
  });

  document.getElementById('btn-quit')?.addEventListener('click', () => returnToTitle());

  document.getElementById('music-vol')?.addEventListener('input', e => {
    audio.musicVolume = Number((e.target as HTMLInputElement).value) / 100;
  });
  document.getElementById('sfx-vol')?.addEventListener('input', e => {
    audio.sfxVolume = Number((e.target as HTMLInputElement).value) / 100;
  });
}

function bindMobileControls(): void {
  const zone = document.getElementById('joystick-zone');
  if (zone) input.registerJoystickZone(zone);

  const btnMap: Array<[string, import('@core/InputManager').ActionName]> = [
    ['btn-attack', 'ATTACK'],
    ['btn-heavy',  'HEAVY'],
    ['btn-dodge',  'DODGE'],
    ['btn-clone',  'CLONE'],
  ];
  for (const [id, action] of btnMap) {
    const el = document.getElementById(id);
    if (el) input.registerMobileButton(el, action);
  }
}

/* ================================================================== */
/* 10. Resize                                                           */
/* ================================================================== */

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera?.resize(window.innerWidth, window.innerHeight);
});

/* ================================================================== */
/* 11. Helpers                                                          */
/* ================================================================== */

function isMobile(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/* ================================================================== */
/* 12. Boot                                                             */
/* ================================================================== */

async function boot(): Promise<void> {
  screens.setLoadingProgress(0.2, 'Reading the sutras…');
  await loadConfigs();
  screens.setLoadingProgress(0.9, 'Preparing the clouds…');
  await delay(300);
  screens.setLoadingProgress(1.0, 'Ready.');
  await delay(400);

  bindUI();
  bindMobileControls();
  screens.show('title');
}

boot().catch(console.error);
