# ARCHITECTURE
## Wukong vs Buddha — Technical Design

**Version:** 0.1 (M0)  
**Stack:** TypeScript 5 · Vite 8 · Three.js r186 · Capacitor 6  

---

## 1. Directory Layout

```
/
├── public/assets/
│   ├── models/          GLB (Draco/meshopt compressed) — M5
│   ├── textures/        WebP / KTX2 — M5
│   ├── audio/           OGG + M4A — M3/M5
│   └── config/
│       ├── wukong.json  Player stats + abilities
│       └── buddha.json  Boss phases + attack patterns
├── src/
│   ├── main.ts          Entry point — boot sequence
│   ├── style.css        Global stylesheet (no framework)
│   ├── core/
│   │   ├── GameLoop.ts      rAF + fixed-step dt cap
│   │   ├── InputManager.ts  Keyboard, mouse, gamepad, touch
│   │   ├── AudioManager.ts  Web Audio API bus
│   │   ├── EventBus.ts      Typed cross-system events
│   │   └── ObjectPool.ts    Generic typed pool
│   ├── scene/
│   │   ├── Arena.ts         Temple platform + clouds + skyDome
│   │   ├── Lighting.ts      Dusk sun, ambient, hemisphere
│   │   └── Camera.ts        Spring-arm + lock-on
│   ├── entities/
│   │   ├── Entity.ts        Base class (HP, death, abstract update)
│   │   ├── Wukong.ts        Player controller
│   │   └── Buddha.ts        Boss entity (greybox M1, full AI M2)
│   ├── combat/
│   │   └── HitDetector.ts   Sphere-overlap hit resolution
│   ├── ai/
│   │   └── StateMachine.ts  Generic FSM (full BossAI in M2)
│   ├── vfx/
│   │   └── ArenaFX.ts       GPU particle system (cloud/gold motes)
│   └── ui/
│       ├── HUD.ts           DOM overlay (bars, combo, reticle)
│       └── ScreenManager.ts All overlay screens
├── vite.config.ts
├── tsconfig.json
├── capacitor.config.ts  (M6)
└── package.json
```

---

## 2. Game Loop

```
requestAnimationFrame tick(now)
  dt = clamp(now - lastTime, 0, 100ms)
  update(dt):
    InputManager.poll()
    Wukong.update(dt, bus)
    Buddha.update(dt, bus)
    HitDetector.resolve(wukong, buddha, bus)
    Arena.update(dt)
    ArenaFX.update(dt)
    Lighting.update(dt)
    Camera.update(dt, playerTarget, bossTarget, input)
    HUD.update(dt, wukong, buddha)
  render():
    renderer.render(scene, camera)
```

---

## 3. Input Action Map

| Action | Keyboard | Mouse | Gamepad | Touch |
|---|---|---|---|---|
| MOVE | WASD | — | Left stick | Joystick |
| ATTACK | — | LMB | A/Square | Btn A |
| HEAVY | — | RMB | X/Triangle | Btn B |
| DODGE | Space | — | B/Circle | Btn C |
| CLONE | Q | — | LB/L1 | Btn D |
| LOCK_ON | Tab | — | R3 | Dbl-tap boss |
| PAUSE | Esc | — | Start | Pause icon |

---

## 4. Entity Model

```
Entity (abstract)
 ├─ hp, maxHp, isDead
 ├─ scene: THREE.Group   ← only Three.js dependency
 └─ abstract update(dt, bus)

Wukong extends Entity
 ├─ stamina, focus
 ├─ State: IDLE|RUN|ATTACK|HEAVY|DODGE|HIT|DEAD
 ├─ comboIndex, comboTimer
 ├─ pendingAttacks[]     ← read by HitDetector
 └─ cooldown timers: dodge, heavy, clone

Buddha extends Entity
 ├─ phase: 1|2|3
 ├─ isInvulnerable (transition window)
 └─ floatPhase (idle animation)
```

---

## 5. Event Bus (typed)

| Event | Payload |
|---|---|
| `game:start/pause/resume/victory/defeat` | void |
| `player:hit` | { damage, position } |
| `player:died` | void |
| `boss:hit` | { damage, position } |
| `boss:phase_change` | { phase: 1\|2\|3 } |
| `boss:died` | void |
| `combo:count` | { count } |
| `combo:reset` | void |

---

## 6. Performance Budget

| Metric | PC HIGH | Mobile LOW |
|---|---|---|
| Draw calls | ≤ 80 | ≤ 40 |
| Triangles | ≤ 200 k | ≤ 80 k |
| JS frame time | ≤ 6 ms | ≤ 12 ms |
| Particles | 300 | 80 |

Arena particles: 1 draw call (Points). Shadow maps: disabled on LOW.

---

## 7. Milestone → Module Map

| M | Adds |
|---|---|
| M0 | Scaffold, configs, game loop stub |
| M1 | Arena, Camera, Wukong, Buddha greybox, ArenaFX, HUD, ScreenManager |
| M2 | ComboSystem, BossAI P1, TelegraphFX, HitFX, full HitDetector |
| M3 | BossAI P2+P3, ParticleSystem, AudioManager wired, ArenaFX Phase 3 |
| M4 | MobileControls polished, PauseMenu, DamageNumbers, ScreenTransitions |
| M5 | GLB asset loading, KTX2 textures, QualityScaler, ObjectPool tuning |
| M6 | Capacitor build, haptics, landscape lock |
| M7 | Polish, Vitest suite, ASSETS.md final |

---

*End of ARCHITECTURE v0.1*
