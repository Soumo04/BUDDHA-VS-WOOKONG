# Wukong vs Buddha 🐒⚡

> *"The Great Sage Equal to Heaven meets his reckoning."*

A third-person 3D boss-battle. **Sun Wukong** vs **the Tathagata Buddha**, above the clouds.  
Built with **TypeScript + Vite + Three.js**. Packages to Android/iOS via Capacitor.

---

## Quick Start

```bash
npm install       # install deps
npm run dev       # → http://localhost:5173
npm run type-check
npm run test
npm run build     # production bundle
```

> Node ≥ 18 required.

---

## Controls

| Action | PC Keyboard | Mouse | Gamepad | Mobile |
|---|---|---|---|---|
| Move | WASD | — | Left stick | Joystick |
| Attack combo | — | Left click | A/Square | Btn A |
| Heavy attack | — | Right click | X/Triangle | Btn B |
| Dodge | Space | — | B/Circle | Btn C |
| Clone skill | Q | — | LB/L1 | Btn D |
| Lock-on | Tab | — | R3 | Double-tap boss |
| Pause | Esc | — | Start | Pause icon |

---

## Milestone Map

| # | Name | Status |
|---|---|---|
| M0 | Plan + scaffold | ✅ Done |
| M1 | Greybox — movement, camera, arena | ✅ Done |
| M2 | Combat + boss phase 1 | ⬜ Next |
| M3 | Phases 2–3 + VFX + audio | ⬜ |
| M4 | UI + mobile controls | ⬜ |
| M5 | MCP assets + optimisation | ⬜ |
| M6 | Capacitor Android/iOS | ⬜ |
| M7 | Polish + playtest | ⬜ |

---

## Environment Variables

```bash
cp .env.example .env   # fill in any keys (never commit .env)
```

---

## Docs

- [GAME_DESIGN.md](./GAME_DESIGN.md) — full GDD
- [ARCHITECTURE.md](./ARCHITECTURE.md) — technical design
- [ASSETS.md](./ASSETS.md) — asset registry and licences

---

## Licence
Source code: **MIT**. Art assets: see ASSETS.md per-asset licence column.
