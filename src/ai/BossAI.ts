/**
 * BossAI — full state machine for The Tathagata Buddha.
 *
 * States:  IDLE → TELEGRAPH → ATTACK → RECOVERY → IDLE
 *                           ↘ STUNNED (on stagger hit)
 *                           ↘ PHASE_TRANSITION
 *
 * All attack timing comes from AttackPatterns (buddha.json) — zero hardcoding.
 */
import * as THREE from 'three';
import type { AttackDef, Projectile } from '@combat/AttackDef';
import type { AttackPatterns } from './AttackPatterns';
import type { TelegraphFX } from '@vfx/TelegraphFX';
import type { HitFX } from '@vfx/HitFX';
import type { EventBus } from '@core/EventBus';
import type { ObjectPool } from '@core/ObjectPool';

export type BossState =
  | 'IDLE'
  | 'TELEGRAPH'
  | 'ATTACK'
  | 'RECOVERY'
  | 'STUNNED'
  | 'PHASE_TRANSITION'
  | 'DEAD';

export interface BossAIDeps {
  scene:         THREE.Scene;
  bossGroup:     THREE.Group;
  patterns:      AttackPatterns;
  telegraphFX:   TelegraphFX;
  hitFX:         HitFX;
  bus:           EventBus;
  projectilePool:ObjectPool<THREE.Mesh>;
  getPlayerPos:  () => THREE.Vector3;
}

export class BossAI {
  private state: BossState = 'IDLE';
  private stateTimer = 0;
  private idleTimer  = 0;
  private phase: 1 | 2 | 3 = 1;

  private currentAttack: AttackDef | null = null;

  // Projectiles managed by AI
  private activeProjectiles: Projectile[] = [];

  // Stagger
  private stunTimer = 0;
  private readonly STUN_DURATION = 1.8;

  // Deps
  private deps: BossAIDeps;

  // Arm references for animation (set by Buddha after mesh creation)
  handL: THREE.Object3D | null = null;
  handR: THREE.Object3D | null = null;
  bodyGroup: THREE.Group | null = null;

  constructor(deps: BossAIDeps) {
    this.deps = deps;
    this.idleTimer = deps.patterns.getIdleTime(1);
  }

  setPhase(phase: 1 | 2 | 3): void {
    this.phase = phase;
    this.state = 'IDLE';
    this.stateTimer = 0;
    this.idleTimer  = this.deps.patterns.getIdleTime(phase);
    this.currentAttack = null;
  }

  /** Called by Buddha.takeDamage when a heavy / clone hit staggers. */
  stagger(): void {
    if (this.state === 'PHASE_TRANSITION' || this.state === 'DEAD') return;
    this.state = 'STUNNED';
    this.stateTimer = 0;
    this.stunTimer  = this.STUN_DURATION;
    this.deps.bus.emit('boss:stunned' as never);
  }

  /** Main update — called every frame. */
  update(dt: number, isDead: boolean): void {
    if (isDead) { this.state = 'DEAD'; return; }

    this.deps.patterns.update(dt, 1.0);
    this.updateProjectiles(dt);

    this.stateTimer += dt;

    switch (this.state) {
      case 'IDLE':        this.updateIdle(dt);        break;
      case 'TELEGRAPH':   this.updateTelegraph(dt);   break;
      case 'ATTACK':      this.updateAttack(dt);      break;
      case 'RECOVERY':    this.updateRecovery(dt);    break;
      case 'STUNNED':     this.updateStunned(dt);     break;
      case 'PHASE_TRANSITION': /* handled externally */ break;
    }

    // Idle facing — boss slowly turns toward player
    const bossPos  = this.deps.bossGroup.position;
    const playerPos = this.deps.getPlayerPos();
    const toPlayer = new THREE.Vector3(
      playerPos.x - bossPos.x, 0,
      playerPos.z - bossPos.z,
    ).normalize();
    const targetAngle = Math.atan2(toPlayer.x, toPlayer.z);
    let diff = targetAngle - this.deps.bossGroup.rotation.y;
    while (diff >  Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.deps.bossGroup.rotation.y += diff * Math.min(1, 2.5 * dt);
  }

  /* ------------------------------------------------------------------ */
  /* State handlers                                                        */
  /* ------------------------------------------------------------------ */

  private updateIdle(dt: number): void {
    this.idleTimer -= dt;
    if (this.idleTimer > 0) return;

    const attack = this.deps.patterns.nextAttack(this.phase);
    if (!attack) {
      // All on cooldown — wait a bit more
      this.idleTimer = 0.5;
      return;
    }

    this.currentAttack = attack;
    this.transition('TELEGRAPH');

    // Spawn telegraph FX
    const playerPos = this.deps.getPlayerPos();
    this.deps.telegraphFX.spawn(
      attack.telegraphType,
      attack.telegraphDuration,
      playerPos,
      this.deps.bossGroup.position,
      new THREE.Color(attack.color),
    );

    // Animate boss telegraph pose
    this.animateTelegraph(attack);
  }

  private updateTelegraph(_dt: number): void {
    if (!this.currentAttack) { this.transition('IDLE'); return; }
    if (this.stateTimer >= this.currentAttack.telegraphDuration) {
      this.transition('ATTACK');
      this.executeAttack(this.currentAttack);
    }
  }

  private updateAttack(_dt: number): void {
    if (!this.currentAttack) { this.transition('RECOVERY'); return; }
    if (this.stateTimer >= this.currentAttack.attackDuration) {
      this.deps.patterns.markUsed(this.currentAttack.id, this.phase);
      this.transition('RECOVERY');
      this.animateRecovery();
    }
  }

  private updateRecovery(_dt: number): void {
    if (!this.currentAttack) { this.transition('IDLE'); return; }
    if (this.stateTimer >= this.currentAttack.recoveryDuration) {
      this.currentAttack = null;
      this.transition('IDLE');
      this.idleTimer = this.deps.patterns.getIdleTime(this.phase);
    }
  }

  private updateStunned(_dt: number): void {
    this.stunTimer -= _dt;
    // Shake effect
    if (this.bodyGroup) {
      this.bodyGroup.position.x = (Math.random() - 0.5) * 0.2;
    }
    if (this.stunTimer <= 0) {
      if (this.bodyGroup) this.bodyGroup.position.x = 0;
      this.transition('RECOVERY');
      this.currentAttack = null;
      this.idleTimer = this.deps.patterns.getIdleTime(this.phase);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Attack execution                                                      */
  /* ------------------------------------------------------------------ */

  private executeAttack(attack: AttackDef): void {
    const playerPos = this.deps.getPlayerPos();
    const bossPos   = this.deps.bossGroup.position;

    switch (attack.id) {
      case 'P1_PALM':
      case 'P3_MOUNTAIN':
        this.executePalmSlam(attack, playerPos);
        break;

      case 'P1_SUTRA':
      case 'P2_LOTUS':
        this.executeProjectileVolley(attack, bossPos, playerPos);
        break;

      case 'P1_SWEEP':
        this.executeSweep(attack, bossPos, playerPos);
        break;

      case 'P2_BARRIER':
        this.deps.bus.emit('boss:barrier_start' as never, { duration: attack.barrierDuration ?? 6 });
        break;

      case 'P2_GUARDIAN':
        this.deps.bus.emit('boss:summon_guardians' as never, { count: attack.addCount ?? 2 });
        break;

      case 'P3_STOMP':
        this.executeShockwave(attack, bossPos);
        break;

      case 'P3_DIVINE':
        this.executeDivineRay(attack, bossPos);
        break;
    }
  }

  // PALM SLAM — instant AOE at player position
  private executePalmSlam(attack: AttackDef, targetPos: THREE.Vector3): void {
    const hitRadius = attack.hitRadius ?? 4;
    this.deps.bus.emit('boss:palm_slam' as never, {
      position: targetPos.clone(),
      radius:   hitRadius,
      damage:   attack.damage,
    });
    this.deps.hitFX.spawnExplosion(targetPos, new THREE.Color(attack.color));

    // Arm slam animation
    this.animateArmSlam();
  }

  // PROJECTILE VOLLEY — fires N projectiles toward player
  private executeProjectileVolley(attack: AttackDef, bossPos: THREE.Vector3, playerPos: THREE.Vector3): void {
    const count = attack.projectileCount ?? 3;
    const speed = attack.projectileSpeed ?? 8;
    const toPlayer = new THREE.Vector3()
      .subVectors(playerPos, bossPos)
      .normalize();

    const baseAngle = Math.atan2(toPlayer.x, toPlayer.z);

    for (let i = 0; i < count; i++) {
      const spread = (i / Math.max(1, count - 1) - 0.5) * 0.6;
      const angle  = baseAngle + spread;

      const mesh = this.deps.projectilePool.acquire();
      mesh.visible = true;
      mesh.position.copy(bossPos).add(new THREE.Vector3(0, 2, 0));
      mesh.userData['velocity'] = new THREE.Vector3(
        Math.sin(angle) * speed,
        0,
        Math.cos(angle) * speed,
      );
      mesh.userData['damage']   = attack.damage;
      mesh.userData['lifetime'] = 0;
      mesh.userData['maxLife']  = 5;
      this.deps.scene.add(mesh);

      this.activeProjectiles.push({
        mesh,
        velocity: mesh.userData['velocity'] as THREE.Vector3,
        damage:   attack.damage,
        active:   true,
        lifetime: 0,
      });
    }
  }

  // ARM SWEEP — arc AOE in front of boss
  private executeSweep(attack: AttackDef, bossPos: THREE.Vector3, playerPos: THREE.Vector3): void {
    this.deps.bus.emit('boss:sweep' as never, {
      origin:  bossPos.clone(),
      toward:  playerPos.clone(),
      arc:     attack.hitArc ?? 180,
      range:   attack.hitRange ?? 6,
      damage:  attack.damage,
    });
    this.deps.hitFX.spawnSweep(bossPos, new THREE.Color(attack.color));
    this.animateArmSweep();
  }

  // SHOCKWAVE — ring that expands from boss feet
  private executeShockwave(attack: AttackDef, bossPos: THREE.Vector3): void {
    this.deps.bus.emit('boss:shockwave' as never, {
      origin:   bossPos.clone(),
      radius:   attack.shockwaveRadius ?? 12,
      speed:    attack.shockwaveSpeed  ?? 14,
      damage:   attack.damage,
    });
  }

  // DIVINE RAY — sweeping beam (P3)
  private executeDivineRay(attack: AttackDef, bossPos: THREE.Vector3): void {
    this.deps.bus.emit('boss:divine_ray' as never, {
      origin:  bossPos.clone(),
      arc:     attack.sweepArc ?? 180,
      damage:  attack.damage,
      duration:attack.attackDuration,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Projectile management                                                 */
  /* ------------------------------------------------------------------ */

  private updateProjectiles(dt: number): void {
    const playerPos = this.deps.getPlayerPos();

    for (let i = this.activeProjectiles.length - 1; i >= 0; i--) {
      const p = this.activeProjectiles[i];
      if (!p.active) { this.activeProjectiles.splice(i, 1); continue; }

      p.lifetime += dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.y += dt * 3;

      // Hit player check
      const distToPlayer = p.mesh.position.distanceTo(playerPos);
      if (distToPlayer < 1.2) {
        this.deps.bus.emit('boss:projectile_hit' as never, {
          damage:   p.damage,
          position: p.mesh.position.clone(),
        });
        this.despawnProjectile(p, i);
        continue;
      }

      // Lifetime expiry or out of bounds
      if (p.lifetime > 5 || p.mesh.position.length() > 60) {
        this.despawnProjectile(p, i);
      }
    }
  }

  private despawnProjectile(p: Projectile, idx: number): void {
    p.active = false;
    p.mesh.visible = false;
    this.deps.scene.remove(p.mesh);
    this.deps.projectilePool.release(p.mesh);
    this.activeProjectiles.splice(idx, 1);
  }

  /** Clear all projectiles on phase transition. */
  clearProjectiles(): void {
    for (const p of this.activeProjectiles) {
      p.active = false;
      p.mesh.visible = false;
      this.deps.scene.remove(p.mesh);
      this.deps.projectilePool.release(p.mesh);
    }
    this.activeProjectiles = [];
  }

  /* ------------------------------------------------------------------ */
  /* Procedural animations (greybox — mesh refs set from Buddha)          */
  /* ------------------------------------------------------------------ */

  private animateTelegraph(attack: AttackDef): void {
    // Glow intensifies — handled by Buddha.update() reading this state
    if (this.bodyGroup) {
      // Slight lean forward
      const target = attack.id.includes('PALM') ? 0.15 : 0.05;
      this.animateLean(target, attack.telegraphDuration * 0.5);
    }
  }

  private animateRecovery(): void {
    this.animateLean(0, 0.4);
  }

  private animateLean(targetX: number, duration: number): void {
    if (!this.bodyGroup) return;
    const start    = this.bodyGroup.rotation.x;
    const startMs  = performance.now();
    const animate  = () => {
      const t = Math.min(1, (performance.now() - startMs) / (duration * 1000));
      const e = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
      if (this.bodyGroup) this.bodyGroup.rotation.x = start + (targetX - start) * e;
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  private animateArmSlam(): void {
    if (!this.handL || !this.handR) return;
    const origL = this.handL.rotation.z;
    const origR = this.handR.rotation.z;
    let t = 0;
    const animate = () => {
      t += 0.05;
      if (!this.handL || !this.handR) return;
      const wave = Math.sin(t * Math.PI);
      this.handL.rotation.z = origL - wave * 1.2;
      this.handR.rotation.z = origR + wave * 1.2;
      if (t < 1) requestAnimationFrame(animate);
      else {
        this.handL.rotation.z = origL;
        this.handR.rotation.z = origR;
      }
    };
    requestAnimationFrame(animate);
  }

  private animateArmSweep(): void {
    if (!this.handL) return;
    const orig = this.handL.rotation.z;
    let t = 0;
    const animate = () => {
      t += 0.04;
      if (!this.handL) return;
      this.handL.rotation.z = orig + Math.sin(t * Math.PI) * 2.0;
      if (t < 1) requestAnimationFrame(animate);
      else this.handL.rotation.z = orig;
    };
    requestAnimationFrame(animate);
  }

  /* ------------------------------------------------------------------ */
  /* Helpers                                                               */
  /* ------------------------------------------------------------------ */

  private transition(next: BossState): void {
    this.state = next;
    this.stateTimer = 0;
  }

  get currentState(): BossState { return this.state; }
  get activeAttack(): AttackDef | null { return this.currentAttack; }
}
