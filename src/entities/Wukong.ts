import * as THREE from 'three';
import { Entity } from './Entity';
import type { InputManager } from '@core/InputManager';
import type { EventBus } from '@core/EventBus';

export interface WukongConfig {
  player: {
    maxHp: number; maxStamina: number; maxFocus: number;
    moveSpeed: number; sprintSpeed: number;
    dodgeDistance: number; dodgeIFrames: number;
    dodgeCooldown: number; dodgeStaminaCost: number;
    staminaRegen: number; staminaRegenDelay: number;
  };
  abilities: {
    combo: { hits: Array<{ damage: number; focusGain: number; hitstopMs: number; comboWindow: number; range: number }> };
    heavy: { damage: number; focusGain: number; staminaCost: number; cooldown: number; range: number; staffScaleFactor: number; staffMorphDuration: number };
    clone: { focusCost: number; cooldown: number; duration: number; aggroDuration: number; count: number; explosionDamage: number };
  };
}

type WukongState = 'IDLE' | 'RUN' | 'ATTACK' | 'HEAVY' | 'DODGE' | 'HIT' | 'DEAD';

export class Wukong extends Entity {
  private cfg: WukongConfig;
  private input: InputManager;
  private cameraYaw: () => number;

  // Stats
  stamina: number;
  focus: number;
  private staminaRegenTimer = 0;

  // State
  private state: WukongState = 'IDLE';
  private stateTimer = 0;
  private isIframe = false;

  // Combo
  private comboIndex = 0;
  private comboTimer = 0;

  // Cooldowns
  private dodgeCooldownTimer = 0;
  private heavyCooldownTimer = 0;
  private cloneCooldownTimer = 0;

  // Dodge direction
  private dodgeDir = new THREE.Vector3(0, 0, -1);

  // Mesh references (greybox)
  private bodyMesh!: THREE.Mesh;
  private staffMesh!: THREE.Mesh;
  private headMesh!: THREE.Mesh;

  // Hit flash timer
  private hitFlashTimer = 0;
  private readonly bodyMat: THREE.MeshStandardMaterial;
  private readonly staffMat: THREE.MeshStandardMaterial;

  // Arena radius for clamping
  private readonly ARENA_RADIUS = 28;

  /** Emitted attack events (read by HitDetector each frame, then cleared) */
  pendingAttacks: Array<{ damage: number; range: number; type: string }> = [];

  constructor(cfg: WukongConfig, input: InputManager, scene: THREE.Scene, cameraYaw: () => number) {
    super(cfg.player.maxHp);
    this.cfg = cfg;
    this.input = input;
    this.cameraYaw = cameraYaw;
    this.stamina = cfg.player.maxStamina;
    this.focus   = 0;

    this.bodyMat  = new THREE.MeshStandardMaterial({ color: 0xff8533, roughness: 0.6 });
    this.staffMat = new THREE.MeshStandardMaterial({
      color: 0xd4a017,
      roughness: 0.3,
      metalness: 0.6,
      emissive: new THREE.Color(0xd4a017),
      emissiveIntensity: 0.1,
    });

    this.buildMesh();
    scene.add(this.scene);
    this.scene.position.set(0, 0, 10);
  }

  /* ------------------------------------------------------------------ */
  /* Greybox mesh                                                         */
  /* ------------------------------------------------------------------ */

  private buildMesh(): void {
    // Body (orange capsule approximated with cylinder + spheres)
    const torsoGeo = new THREE.CylinderGeometry(0.35, 0.3, 1.0, 8);
    this.bodyMesh = new THREE.Mesh(torsoGeo, this.bodyMat);
    this.bodyMesh.position.y = 0.9;
    this.bodyMesh.castShadow = true;
    this.scene.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.SphereGeometry(0.28, 8, 6);
    this.headMesh = new THREE.Mesh(headGeo, this.bodyMat);
    this.headMesh.position.y = 1.65;
    this.headMesh.castShadow = true;
    this.scene.add(this.headMesh);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0xcc5500, roughness: 0.7 });
    for (const side of [-0.18, 0.18]) {
      const legGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.6, 6);
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(side, 0.3, 0);
      this.scene.add(leg);
    }

    // Staff (starts centred, extends to the right)
    const staffGeo = new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6);
    this.staffMesh = new THREE.Mesh(staffGeo, this.staffMat);
    this.staffMesh.position.set(0.5, 1.0, 0);
    this.staffMesh.rotation.z = Math.PI / 2.5;
    this.staffMesh.castShadow = true;
    this.scene.add(this.staffMesh);

    // Staff tips (gold orbs)
    const tipGeo = new THREE.SphereGeometry(0.09, 6, 4);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xffd60a, emissive: new THREE.Color(0xffd60a), emissiveIntensity: 0.6, roughness: 0.1 });
    for (const yOff of [-1.2, 1.2]) {
      const tip = new THREE.Mesh(tipGeo, tipMat);
      tip.position.set(0, yOff, 0);
      this.staffMesh.add(tip);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Update                                                               */
  /* ------------------------------------------------------------------ */

  update(dt: number, bus: EventBus): void {
    if (this._isDead) return;
    this.pendingAttacks = [];

    this.stateTimer += dt;
    this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);

    // Flash effect when hit
    this.bodyMat.emissive.set(this.hitFlashTimer > 0 ? 0xff2222 : 0x000000);
    this.bodyMat.emissiveIntensity = this.hitFlashTimer > 0 ? 0.8 : 0;

    // Cooldown timers
    if (this.dodgeCooldownTimer > 0) this.dodgeCooldownTimer -= dt;
    if (this.heavyCooldownTimer  > 0) this.heavyCooldownTimer  -= dt;
    if (this.cloneCooldownTimer  > 0) this.cloneCooldownTimer  -= dt;

    // Stamina regen
    const isActing = this.state === 'ATTACK' || this.state === 'HEAVY' || this.state === 'DODGE';
    if (!isActing) {
      this.staminaRegenTimer += dt;
      if (this.staminaRegenTimer >= this.cfg.player.staminaRegenDelay) {
        this.stamina = Math.min(this.cfg.player.maxStamina,
          this.stamina + this.cfg.player.staminaRegen * dt);
      }
    } else {
      this.staminaRegenTimer = 0;
    }

    // Combo window decay
    if (this.state !== 'ATTACK') {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.comboIndex = 0;
    }

    switch (this.state) {
      case 'IDLE':
      case 'RUN':
        this.handleMovement(dt);
        this.handleAttackInput(bus);
        break;
      case 'ATTACK':
        this.updateAttack(dt, bus);
        break;
      case 'HEAVY':
        this.updateHeavy(dt, bus);
        break;
      case 'DODGE':
        this.updateDodge(dt);
        break;
      case 'HIT':
        if (this.stateTimer > 0.25) this.setState('IDLE');
        break;
    }

    // Clamp to arena
    const pos = this.scene.position;
    const flatDist = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
    if (flatDist > this.ARENA_RADIUS) {
      pos.x = (pos.x / flatDist) * this.ARENA_RADIUS;
      pos.z = (pos.z / flatDist) * this.ARENA_RADIUS;
    }
    pos.y = 0; // keep on ground
  }

  /* ------------------------------------------------------------------ */
  /* Movement                                                             */
  /* ------------------------------------------------------------------ */

  private handleMovement(dt: number): void {
    const mv = this.input.moveVector;
    const speed = this.cfg.player.moveSpeed;

    if (Math.abs(mv.x) + Math.abs(mv.y) > 0.05) {
      // Translate movement relative to camera yaw
      const yaw = this.cameraYaw();
      const sinY = Math.sin(yaw);
      const cosY = Math.cos(yaw);
      const wx = mv.x * cosY + mv.y * sinY;
      const wz = mv.x * -sinY + mv.y * cosY;

      this.scene.position.x += wx * speed * dt;
      this.scene.position.z -= wz * speed * dt;

      // Face movement direction
      const targetAngle = Math.atan2(wx, -wz);
      let diff = targetAngle - this.scene.rotation.y;
      while (diff >  Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.scene.rotation.y += diff * Math.min(1, 12 * dt);

      this.setState('RUN');
      this.animateRunning(dt);
    } else {
      this.setState('IDLE');
      this.animateIdle(dt);
    }

    // Dodge input
    if (this.input.isJustPressed('DODGE') && this.dodgeCooldownTimer <= 0 && this.stamina >= this.cfg.player.dodgeStaminaCost) {
      this.startDodge();
    }
  }

  private handleAttackInput(bus: EventBus): void {
    if (this.input.isJustPressed('ATTACK')) this.startComboHit(bus);
    if (this.input.isJustPressed('HEAVY')  && this.heavyCooldownTimer <= 0 && this.stamina >= this.cfg.abilities.heavy.staminaCost) this.startHeavy();
    if (this.input.isJustPressed('CLONE')  && this.cloneCooldownTimer <= 0 && this.focus >= this.cfg.abilities.clone.focusCost) this.useClone(bus);
  }

  /* ------------------------------------------------------------------ */
  /* Combat actions                                                       */
  /* ------------------------------------------------------------------ */

  private startComboHit(bus: EventBus): void {
    const hit = this.cfg.abilities.combo.hits[this.comboIndex];
    if (!hit) return;

    this.setState('ATTACK');
    this.pendingAttacks.push({ damage: hit.damage, range: hit.range, type: `swing${this.comboIndex + 1}` });

    // Focus gain
    this.focus = Math.min(this.cfg.player.maxFocus, this.focus + hit.focusGain);
    bus.emit('combo:count', { count: this.comboIndex + 1 });

    // Advance combo
    this.comboIndex = (this.comboIndex + 1) % this.cfg.abilities.combo.hits.length;
    this.comboTimer = hit.comboWindow;

    // Visual: swing staff
    this.animateSwing(this.comboIndex - 1);
  }

  private updateAttack(dt: number, _bus: EventBus): void {
    if (this.stateTimer > 0.35) {
      if (this.input.isJustPressed('ATTACK')) this.startComboHit(_bus);
      else this.setState('IDLE');
    }
  }

  private startHeavy(): void {
    this.stamina -= this.cfg.abilities.heavy.staminaCost;
    this.heavyCooldownTimer = this.cfg.abilities.heavy.cooldown;
    this.setState('HEAVY');

    const h = this.cfg.abilities.heavy;
    this.pendingAttacks.push({ damage: h.damage, range: h.range, type: 'heavy' });
    this.focus = Math.min(this.cfg.player.maxFocus, this.focus + h.focusGain);

    // Grow staff
    const targetScale = h.staffScaleFactor;
    this.growStaff(targetScale, h.staffMorphDuration);
  }

  private updateHeavy(dt: number, _bus: EventBus): void {
    if (this.stateTimer > 0.8) {
      this.growStaff(1, 0.3);
      this.setState('IDLE');
    }
  }

  private startDodge(): void {
    this.stamina -= this.cfg.player.dodgeStaminaCost;
    this.dodgeCooldownTimer = this.cfg.player.dodgeCooldown;
    this.isIframe = true;

    // Dodge in move direction or backwards
    const mv = this.input.moveVector;
    const yaw = this.cameraYaw();
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    if (Math.abs(mv.x) + Math.abs(mv.y) > 0.05) {
      const wx = mv.x * cosY + mv.y * sinY;
      const wz = mv.x * -sinY + mv.y * cosY;
      this.dodgeDir.set(wx, 0, -wz).normalize();
    } else {
      this.dodgeDir.set(0, 0, 1); // back-step
    }

    this.setState('DODGE');
  }

  private updateDodge(dt: number): void {
    const speed = this.cfg.player.dodgeDistance / this.cfg.player.dodgeIFrames;
    this.scene.position.addScaledVector(this.dodgeDir, speed * dt);

    // Cloud dash effect — brief scale pulse
    const t = this.stateTimer / this.cfg.player.dodgeIFrames;
    this.scene.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.15);

    if (this.stateTimer > this.cfg.player.dodgeIFrames) {
      this.isIframe = false;
      this.scene.scale.setScalar(1);
      this.setState('IDLE');
    }
  }

  private useClone(bus: EventBus): void {
    this.focus -= this.cfg.abilities.clone.focusCost;
    this.cloneCooldownTimer = this.cfg.abilities.clone.cooldown;
    bus.emit('player:hit', { damage: 0, position: { x: this.scene.position.x, y: 1, z: this.scene.position.z } });
    // Full clone VFX/logic in M2
    console.log('[Wukong] Clone skill used!');
  }

  /* ------------------------------------------------------------------ */
  /* Animations (procedural for greybox)                                 */
  /* ------------------------------------------------------------------ */

  private runPhase = 0;
  private animateRunning(dt: number): void {
    this.runPhase += dt * 8;
    this.bodyMesh.position.y = 0.9 + Math.sin(this.runPhase) * 0.06;
    this.headMesh.position.y = 1.65 + Math.sin(this.runPhase) * 0.06;
  }

  private animateIdle(dt: number): void {
    this.runPhase += dt * 1.5;
    this.bodyMesh.position.y = 0.9 + Math.sin(this.runPhase) * 0.02;
    this.headMesh.position.y = 1.65 + Math.sin(this.runPhase) * 0.02;
    this.staffMesh.rotation.z = Math.PI / 2.5 + Math.sin(this.runPhase * 0.8) * 0.04;
  }

  private animateSwing(hitIdx: number): void {
    const dir = hitIdx % 2 === 0 ? 1 : -1;
    this.staffMesh.rotation.y = dir * 0.8;
    // Reset after 0.2s (approximation; proper tween in M3)
    setTimeout(() => { this.staffMesh.rotation.y = 0; }, 200);
  }

  private growStaff(targetScale: number, duration: number): void {
    const start = this.staffMesh.scale.y;
    const startTime = performance.now();
    const animate = () => {
      const t = Math.min(1, (performance.now() - startTime) / (duration * 1000));
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.staffMesh.scale.set(1, start + (targetScale - start) * ease, 1);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }

  /* ------------------------------------------------------------------ */
  /* State transitions                                                    */
  /* ------------------------------------------------------------------ */

  private setState(s: WukongState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateTimer = 0;
  }

  /* ------------------------------------------------------------------ */
  /* Entity overrides                                                     */
  /* ------------------------------------------------------------------ */

  override takeDamage(amount: number, source?: Entity): void {
    if (this.isIframe) return;
    super.takeDamage(amount, source);
    this.hitFlashTimer = 0.2;
    this.setState('HIT');
  }

  protected override onDeath(): void {
    super.onDeath();
    this.setState('DEAD');
  }

  /* ------------------------------------------------------------------ */
  /* Getters for HUD                                                      */
  /* ------------------------------------------------------------------ */

  get staminaFraction(): number { return this.stamina / this.cfg.player.maxStamina; }
  get focusFraction():   number { return this.focus   / this.cfg.player.maxFocus;   }
  get dodgeCooldownFraction(): number { return Math.max(0, this.dodgeCooldownTimer / this.cfg.player.dodgeCooldown); }
  get cloneCooldownFraction(): number { return Math.max(0, this.cloneCooldownTimer / this.cfg.abilities.clone.cooldown); }
  get heavyCooldownFraction(): number { return Math.max(0, this.heavyCooldownTimer / this.cfg.abilities.heavy.cooldown); }
  get currentState(): WukongState { return this.state; }
}
