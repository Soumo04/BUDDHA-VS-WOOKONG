/**
 * HitDetector — resolves all combat collisions each frame.
 * 
 * Handles:
 * - Player attacks (combos + heavy) vs Boss
 * - Boss palm slams (event-driven AOE) vs Player
 * - Boss sweeps (arc AOE) vs Player
 * - Boss shockwaves (expanding ring) vs Player
 * - Boss projectile hits are already resolved inside BossAI
 */
import * as THREE from 'three';
import type { Wukong } from '@entities/Wukong';
import type { Buddha } from '@entities/Buddha';
import type { EventBus } from '@core/EventBus';
import type { HitFX } from '@vfx/HitFX';
import type { DamageNumbers } from '@combat/DamageNumbers';

interface ActiveShockwave {
  origin: THREE.Vector3;
  radius: number;
  speed: number;
  damage: number;
  currentRadius: number;
  triggered: boolean;
  lifetime: number;
}

export class HitDetector {
  private scene: THREE.Scene;
  private hitFX: HitFX;
  private dmgNumbers: DamageNumbers;

  // I-frame set — tracks which boss attacks have already hit the player this frame
  private hitSet = new Set<string>();

  // Active shockwaves to update each frame
  private shockwaves: ActiveShockwave[] = [];

  // Temp vectors (avoid allocation)
  private _tmpA = new THREE.Vector3();
  private _tmpB = new THREE.Vector3();

  constructor(scene: THREE.Scene, hitFX: HitFX, dmgNumbers: DamageNumbers) {
    this.scene      = scene;
    this.hitFX      = hitFX;
    this.dmgNumbers = dmgNumbers;
  }

  /** Subscribe to event-driven boss attacks (palm, sweep, shockwave). */
  listenToBus(bus: EventBus): void {
    bus.on('boss:palm_slam', (data: unknown) => {
      const { position, radius, damage } = data as { position: THREE.Vector3; radius: number; damage: number };
      this.pendingPalms.push({ position, radius, damage });
    });

    bus.on('boss:sweep', (data: unknown) => {
      const { origin, toward, arc, range, damage } = data as {
        origin: THREE.Vector3; toward: THREE.Vector3;
        arc: number; range: number; damage: number;
      };
      this.pendingSweeps.push({ origin, toward, arc, range, damage });
    });

    bus.on('boss:shockwave', (data: unknown) => {
      const { origin, radius, speed, damage } = data as {
        origin: THREE.Vector3; radius: number; speed: number; damage: number;
      };
      this.shockwaves.push({ origin, radius, speed, damage, currentRadius: 0, triggered: false, lifetime: 0 });
    });

    bus.on('boss:projectile_hit', (data: unknown) => {
      const { damage, position } = data as { damage: number; position: THREE.Vector3 };
      this.pendingProjectileHits.push({ damage, position });
    });

    bus.on('boss:barrier_start', (data: unknown) => {
      const { duration } = data as { duration: number };
      this.pendingBarrier = duration;
    });
  }

  private pendingPalms:         Array<{ position: THREE.Vector3; radius: number; damage: number }> = [];
  private pendingSweeps:        Array<{ origin: THREE.Vector3; toward: THREE.Vector3; arc: number; range: number; damage: number }> = [];
  private pendingProjectileHits:Array<{ damage: number; position: THREE.Vector3 }> = [];
  private pendingBarrier:       number | null = null;

  /** Main resolution — call after entity updates, before render. */
  resolve(
    wukong: Wukong,
    buddha: Buddha,
    bus: EventBus,
    camera: THREE.Camera,
  ): void {
    this.hitSet.clear();

    // ---- PLAYER → BOSS ----
    for (const atk of wukong.pendingAttacks) {
      if (buddha.isDead || buddha.isInvulnerable) continue;

      const dist = wukong.position.distanceTo(buddha.position);
      if (dist <= atk.range + 1.5) {
        buddha.takeDamage(atk.damage, wukong);

        // Stagger on heavy
        if (atk.staggers) buddha.stagger();

        // VFX
        this._tmpA.copy(buddha.position).add(new THREE.Vector3(0, 3, 0));
        const isCrit = atk.staggers;
        this.hitFX.spawnHitSparks(this._tmpA, new THREE.Color(0xffd700), isCrit ? 35 : 18);

        // Damage number
        const screen = this.worldToScreen(this._tmpA, camera);
        this.dmgNumbers.spawn(screen.x, screen.y, atk.damage, isCrit ? 'crit' : 'boss');

        bus.emit('boss:hit', { damage: atk.damage, position: { x: this._tmpA.x, y: this._tmpA.y, z: this._tmpA.z } });

        if (buddha.isDead) bus.emit('boss:died');
      }
    }

    // ---- BOSS PALM → PLAYER ----
    for (const palm of this.pendingPalms) {
      if (wukong.isIframe || wukong.isDead) continue;
      const dist = wukong.position.distanceTo(palm.position);
      if (dist <= palm.radius) {
        this.hitPlayer(wukong, palm.damage, palm.position, bus, camera);
      }
    }
    this.pendingPalms = [];

    // ---- BOSS SWEEP → PLAYER ----
    for (const sweep of this.pendingSweeps) {
      if (wukong.isIframe || wukong.isDead) continue;
      const dist = wukong.position.distanceTo(sweep.origin);
      if (dist > sweep.range) continue;

      const toPlayer = this._tmpA.copy(wukong.position).sub(sweep.origin).normalize();
      const toTarget = this._tmpB.copy(sweep.toward).sub(sweep.origin).normalize();
      const dot      = toPlayer.dot(toTarget);
      const halfArc  = (sweep.arc / 2) * (Math.PI / 180);

      if (Math.acos(Math.max(-1, Math.min(1, dot))) <= halfArc) {
        this.hitPlayer(wukong, sweep.damage, sweep.origin, bus, camera);
      }
    }
    this.pendingSweeps = [];

    // ---- BOSS SHOCKWAVES → PLAYER ----
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.lifetime += 1/60;

      const dt = 1/60;
      const prevRadius = sw.currentRadius;
      sw.currentRadius += sw.speed * dt;

      if (sw.lifetime > 3) { this.shockwaves.splice(i, 1); continue; }

      if (!sw.triggered && !wukong.isIframe && !wukong.isDead) {
        const dist = wukong.position.distanceTo(sw.origin);
        if (dist >= prevRadius && dist <= sw.currentRadius + 0.5) {
          sw.triggered = true;
          this.hitPlayer(wukong, sw.damage, sw.origin, bus, camera);
        }
      }
    }

    // ---- BOSS PROJECTILE HITS → PLAYER ----
    for (const hit of this.pendingProjectileHits) {
      if (wukong.isIframe || wukong.isDead) continue;
      this.hitPlayer(wukong, hit.damage, hit.position, bus, camera);
    }
    this.pendingProjectileHits = [];

    // ---- BOSS BARRIER ----
    if (this.pendingBarrier !== null) {
      buddha.showBarrier(this.pendingBarrier);
      this.pendingBarrier = null;
    }
  }

  private hitPlayer(
    wukong: Wukong,
    damage: number,
    hitPos: THREE.Vector3,
    bus: EventBus,
    camera: THREE.Camera,
  ): void {
    wukong.takeDamage(damage);
    this.hitFX.spawnPlayerHit(wukong.position.clone().add(new THREE.Vector3(0, 1, 0)));

    const screen = this.worldToScreen(hitPos, camera);
    this.dmgNumbers.spawn(screen.x, screen.y, damage, 'player');

    bus.emit('player:hit', {
      damage,
      position: { x: hitPos.x, y: hitPos.y, z: hitPos.z },
    });

    if (wukong.isDead) bus.emit('player:died');
  }

  private worldToScreen(pos: THREE.Vector3, camera: THREE.Camera): { x: number; y: number } {
    const projected = pos.clone().project(camera);
    return {
      x: (projected.x * 0.5 + 0.5) * window.innerWidth,
      y: (-projected.y * 0.5 + 0.5) * window.innerHeight,
    };
  }
}
