/**
 * main.ts — Boot sequence and game orchestration.
 *
 * Order of operations:
 * 1. Create Three.js renderer + scene
 * 2. Show loading screen, load configs
 * 3. Init all systems (camera, arena, entities, HUD, etc.)
 * 4. Wire up UI button callbacks
 * 5. Start game loop
 */

import * as THREE from 'three';
import './style.css';

import { GameLoop }      from '@core/GameLoop';
import { InputManager }  from '@core/InputManager';
import { AudioManager }  from '@core/AudioManager';
import { EventBus }      from '@core/EventBus';

import { Arena }         from '@scene/Arena';
import { SceneLighting } from '@scene/Lighting';
import { GameCamera }    from '@scene/Camera';

import { Wukong }        from '@entities/Wukong';
import type { WukongConfig } from '@entities/Wukong';
import { Buddha }        from '@entities/Buddha';

import { HitDetector }   from '@combat/HitDetector';
import { HUD }           from '@ui/HUD';
import { ScreenManager } from '@ui/ScreenManager';
import { ArenaFX }       from '@vfx/ArenaFX';

/* ================================================================== */
/* 1. Renderer setup                                                    */
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
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x1a0d1f, 60, 350);

/* ================================================================== */
/* 2. Core systems                                                      */
/* ================================================================== */

const bus    = new EventBus();
const input  = new InputManager();
const audio  = new AudioManager();
const screens = new ScreenManager(audio);
screens.show('loading');

/* ================================================================== */
/* 3. Load configs                                                      */
/* ================================================================== */

screens.setLoadingProgress(0.1, 'Reading the sutras…');

let wukongCfg: WukongConfig;
let buddhaCfg: Record<string, unknown>;

async function loadConfigs(): Promise<void> {
  const [wRes, bRes] = await Promise.all([
    fetch('/assets/config/wukong.json'),
    fetch('/assets/config/buddha.json'),
  ]);
  wukongCfg = await wRes.json() as WukongConfig;
  buddhaCfg = await bRes.json() as Record<string, unknown>;
}

/* ================================================================== */
/* 4. Scene & entity construction (lazy — called on game start)         */
/* ================================================================== */

let camera: GameCamera;
let arena: Arena;
let lighting: SceneLighting;
let wukong: Wukong;
let buddha: Buddha;
let hitDetector: HitDetector;
let hud: HUD;
let arenaFX: ArenaFX;
let loop: GameLoop;
let isPaused = false;

function buildScene(): void {
  camera    = new GameCamera(window.innerWidth / window.innerHeight);
  arena     = new Arena(scene);
  lighting  = new SceneLighting(scene);
  arenaFX   = new ArenaFX(scene);

  const bossCfg = buddhaCfg as {
    boss: { maxHp: number; phase2Threshold: number; phase3Threshold: number };
  };

  wukong = new Wukong(wukongCfg, input, scene, () => camera.cameraYaw);
  buddha = new Buddha(
    scene,
    bossCfg.boss.maxHp,
    bossCfg.boss.phase2Threshold,
    bossCfg.boss.phase3Threshold,
  );

  hitDetector = new HitDetector(scene);
  hud         = new HUD(bus);

  // Phase change → lighting
  bus.on('boss:phase_change', (data: unknown) => {
    const { phase } = data as { phase: 1 | 2 | 3 };
    lighting.setPhase(phase);
  });

  // Win / lose conditions
  bus.on('boss:died',   () => { setTimeout(() => endGame('victory'), 1200); });
  bus.on('player:died', () => { setTimeout(() => endGame('defeat'),  800); });
}

/* ================================================================== */
/* 5. Game loop update / render                                         */
/* ================================================================== */

function update(dt: number, _elapsed: number): void {
  if (isPaused) return;

  input.poll();

  // Pause toggle
  if (input.isJustPressed('PAUSE')) {
    if (screens.active === 'fight') {
      isPaused = true;
      screens.show('pause');
      return;
    }
  }

  // Update entities
  wukong.update(dt, bus);
  buddha.update(dt, bus);

  // Hit resolution
  hitDetector.resolve(wukong, buddha, bus);

  // Scene systems
  arena.update(dt);
  arenaFX.update(dt);
  lighting.update(dt);

  // Camera (player target + optional boss lock-on)
  camera.update(
    dt,
    { position: wukong.position, height: 1.4 },
    { position: buddha.position, height: 2.5 },
    input,
  );

  // HUD
  hud.update(dt, wukong, buddha);

  // Lock-on reticle (project boss to screen)
  if (camera.isLockedOn) {
    const bossPos = buddha.position.clone().add(new THREE.Vector3(0, 2, 0));
    const screenPos = bossPos.project(camera.camera);
    const sx = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
    hud.updateLockOn(true, sx, sy);
  } else {
    hud.updateLockOn(false, 0, 0);
  }

  // Player death check
  if (wukong.isDead) bus.emit('player:died');
}

function render(): void {
  renderer.render(scene, camera.camera);
}

/* ================================================================== */
/* 6. Game flow                                                         */
/* ================================================================== */

function startGame(): void {
  // Unlock audio on first gesture
  audio.unlock();
  isPaused = false;
  screens.show('fight');
  hud.show();

  // Reset entities if restarting
  if (!loop) {
    loop = new GameLoop(update, render);
  }
  loop.start();
}

function endGame(result: 'victory' | 'defeat'): void {
  loop?.stop();
  screens.show(result);
}

function returnToTitle(): void {
  loop?.stop();
  screens.show('title');
  // Rebuild scene on next start
}

/* ================================================================== */
/* 7. UI Callbacks                                                      */
/* ================================================================== */

function bindUI(): void {
  document.getElementById('btn-start')?.addEventListener('click', async () => {
    audio.unlock();
    screens.setLoadingProgress(0.5, 'Summoning the boss…');
    screens.show('loading');
    await new Promise(r => setTimeout(r, 600));
    buildScene();
    screens.setLoadingProgress(1.0, 'The battle begins!');
    await new Promise(r => setTimeout(r, 500));
    startGame();
  });

  document.getElementById('btn-restart-victory')?.addEventListener('click', () => {
    returnToTitle();
    screens.show('title');
  });

  document.getElementById('btn-restart-defeat')?.addEventListener('click', () => {
    returnToTitle();
    screens.show('title');
  });

  document.getElementById('btn-resume')?.addEventListener('click', () => {
    isPaused = false;
    screens.show('fight');
    if (!isMobile()) document.getElementById('game-canvas')?.requestPointerLock?.();
  });

  document.getElementById('btn-quit')?.addEventListener('click', () => {
    returnToTitle();
  });

  document.getElementById('btn-settings')?.addEventListener('click', () => {
    // Open pause-style settings from title — future work
    console.log('[UI] Settings from title — M4');
  });

  // Volume sliders
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
/* 8. Resize handler                                                    */
/* ================================================================== */

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera?.resize(w, h);
});

/* ================================================================== */
/* 9. Boot                                                              */
/* ================================================================== */

function isMobile(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

async function boot(): Promise<void> {
  screens.setLoadingProgress(0.2, 'Reading the sutras…');
  await loadConfigs();
  screens.setLoadingProgress(0.8, 'Preparing the clouds…');
  await new Promise(r => setTimeout(r, 300));
  screens.setLoadingProgress(1.0, 'Ready.');
  await new Promise(r => setTimeout(r, 400));

  bindUI();
  bindMobileControls();

  screens.show('title');
}

boot().catch(console.error);
