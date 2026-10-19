# GAME DESIGN DOCUMENT
## Wukong vs Buddha

**Version:** 0.1 (M0 Draft)  
**Genre:** 3-D Third-Person Boss Fight / Action  
**Platform:** PC (Web), Android, iOS  
**Engine:** Three.js / TypeScript / Vite → Capacitor  

---

## 1. Vision Statement

A single, gloriously realised boss encounter set above the clouds.  
Sun Wukong — the Great Sage Equal to Heaven — makes his final stand  
against the Tathagata Buddha in a battle of will, wit, and raw power.  
Stylised in the spirit of *Journey to the West* classical illustration;  
commercially polished; respectful of Buddhist iconography.

---

## 2. Story Beat

> After 500 years imprisoned beneath Five Elements Mountain, Wukong  
> breaks free one last time and charges back to the Heavenly summit.  
> The Buddha descends from the Pure Land to end this defiance once  
> and for all. One will kneel — one will fall.

Opening: cinematic pan from cloud-sea → temple arena → Buddha materialises on a lotus.  
Victory: Wukong's staff fires a golden beam skyward; arena cracks and he leaps away.  
Defeat: Wukong kneels; Five Elements Mountain descends; screen fades black.

---

## 3. Player Character — Sun Wukong

### 3.1 Stats (all in JSON config)

| Stat | Default |
|---|---|
| Max HP | 100 |
| Max Stamina | 100 |
| Max Focus | 100 |
| Move Speed | 6 m/s |
| Sprint Speed | 9 m/s |
| Dodge Distance | 4 m |
| I-Frame Duration | 0.3 s |
| Dodge Cooldown | 0.8 s |

### 3.2 Abilities

#### Staff Combo (LMB / Square / Tap A) — 3-hit chain
| Hit | Name | Damage | Focus Generated |
|---|---|---|---|
| 1 | Horizontal Sweep | 8 | 10 |
| 2 | Overhead Slam | 10 | 12 |
| 3 | Spinning Finisher | 15 | 18 |

#### Heavy Attack (RMB / Triangle / Tap B) — costs 30 Stamina
Staff grows 3× size. AOE slam. Damage: 40. Focus: +30. Staggers boss in P1/P2. CD: 2 s.

#### Cloud Dash / Dodge (Space / Circle / Swipe)
Direction-aware dash. I-frames: 0.3 s. Costs 20 Stamina. Regen: 15/s idle.

#### Clone Skill (Q / L1 / Button C) — costs 100 Focus
2 orbiting clones for 8 s. Boss aggro 4 s each. Explodes on contact (12 dmg). CD: 20 s.

### 3.3 Camera
- **Lock-on** (Tab / R3): hard lock; soft arc. FOV → 60°.
- **Free**: spring-arm, FOV 65°, lazy follow, auto-rotate on sprint.

---

## 4. Boss — The Tathagata Buddha

### 4.1 Core Stats
| Stat | Value |
|---|---|
| Max HP | 2 000 |
| Phase 2 Threshold | 66 % HP |
| Phase 3 Threshold | 33 % HP |
| Defence Multiplier | 0.8× |

### 4.2 Visual Direction
Colossal classical Chinese Buddhist figure (5× Wukong). Golden skin, five-leaf crown, crimson robes. Eyes: serene P1 → white glow P2 → blazing gold P3. Original design only.

### 4.3 Boss State Machine
```
IDLE → TELEGRAPH → ATTACK → RECOVERY → IDLE
                           ↘ STUNNED
                           ↘ PHASE_TRANSITION
```
Every attack has 1–2 s telegraph (shadow + glow).

### 4.4 Phase 1 — "The Compassionate Fist"
| ID | Name | Damage | CD |
|---|---|---|---|
| P1_PALM | Giant Palm Slam | 25 | 4 s |
| P1_SUTRA | Sutra Ring Volley | 10 each | 6 s |
| P1_SWEEP | Arm Sweep | 20 | 5 s |

### 4.5 Phase 2 — "The Golden Barrier" (P1 attacks ×1.25 speed)
| ID | Name | Notes |
|---|---|---|
| P2_LOTUS | Lotus Projectile Burst | 15 dmg |
| P2_GUARDIAN | Spirit Guardian Summon | 2 adds |
| P2_BARRIER | Golden Barrier | 6 s immune |

### 4.6 Phase 3 — "Five Elements Mountain" (all attacks ×1.5 speed, arena shrinks 60%)
| ID | Name | Damage |
|---|---|---|
| P3_MOUNTAIN | Five Elements Mountain | 60 |
| P3_STOMP | Ground Shockwave | 30 |
| P3_DIVINE | Divine Light Ray | 20 |

---

## 5. Arena — Cloud-Top Temple at Dusk
- Circular marble platform, radius 30 m, gold trim.
- Dusk directional light (warm orange) + blue-grey ambient.
- Drifting cloud particles, lotus petals, Phase-3 lightning.
- Phase 3 boundary: visible kill ring + visual cliff crumble.

---

## 6. HUD
| Element | Position |
|---|---|
| Player HP / Stamina / Focus | Bottom-left |
| Boss HP bar + Phase badge | Top-centre |
| Skill cooldown icons ×4 | Bottom-right |
| Combo counter | Above skill icons |
| Lock-on reticle | World-space on boss |
| Mobile joystick | Left zone |
| Mobile buttons ×4 | Right zone |

---

## 7. Audio
- BGM: 3-layer erhu + taiko, transitions per phase.
- SFX: staff swoosh (pitch shifted per hit), heavy thud, boss palm slam.
- All audio: CC0 / original. No real mantras reproduced.

---

## 8. Difficulty Philosophy
Single difficulty. Pressure from learning patterns, not numbers. Every tell ≥ 1 s window.

---

## 9. Monetisation
Premium one-time: $2.99 mobile / $4.99 PC. No ads, no loot boxes.

---

*GDD v0.1 — approved M0*
