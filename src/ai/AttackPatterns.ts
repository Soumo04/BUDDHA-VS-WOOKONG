/**
 * AttackPatterns — reads buddha.json config and builds per-phase attack queues.
 * BossAI calls nextAttack() to get the next attack, respecting cooldowns.
 */
import type { AttackDef } from '@combat/AttackDef';

interface BuddhaConfig {
  boss: { maxHp: number; defenceMultiplier: number; phase2Threshold: number; phase3Threshold: number };
  phases: Record<string, { speedMultiplier: number; attackRotation: string[]; idleTime: [number, number] }>;
  attacks: Record<string, AttackDef>;
}

export class AttackPatterns {
  private config!: BuddhaConfig;
  private cooldowns = new Map<string, number>();  // id → remaining cooldown
  private rotationIndex: Record<number, number> = { 1: 0, 2: 0, 3: 0 };

  async load(): Promise<void> {
    const res = await fetch('/assets/config/buddha.json');
    this.config = await res.json() as BuddhaConfig;
  }

  /** Called each frame to tick down cooldowns. */
  update(dt: number, speedMult: number): void {
    for (const [id, cd] of this.cooldowns.entries()) {
      const next = cd - dt * speedMult;
      if (next <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, next);
    }
  }

  /**
   * Get the next available attack for the current phase.
   * Skips attacks still on cooldown. Returns null if all on cooldown.
   */
  nextAttack(phase: 1 | 2 | 3): AttackDef | null {
    const phaseData = this.config.phases[String(phase)];
    if (!phaseData) return null;

    const rotation = phaseData.attackRotation;
    const len = rotation.length;

    // Walk rotation from current index, find first not on cooldown
    for (let i = 0; i < len; i++) {
      const idx = (this.rotationIndex[phase] + i) % len;
      const id  = rotation[idx];
      if (!this.cooldowns.has(id)) {
        this.rotationIndex[phase] = (idx + 1) % len;
        const def = this.config.attacks[id];
        if (def) {
          const speedMult = phaseData.speedMultiplier;
          return this.scaleBySpeed(def, speedMult);
        }
      }
    }
    return null;
  }

  /** Mark an attack as used — starts its cooldown. */
  markUsed(attackId: string, phase: 1 | 2 | 3): void {
    const def = this.config.attacks[attackId];
    const phaseData = this.config.phases[String(phase)];
    if (!def || !phaseData) return;
    this.cooldowns.set(attackId, def.cooldown / phaseData.speedMultiplier);
  }

  getIdleTime(phase: 1 | 2 | 3): number {
    const phaseData = this.config.phases[String(phase)];
    if (!phaseData) return 2;
    const [min, max] = phaseData.idleTime;
    return min + Math.random() * (max - min);
  }

  getDefenceMultiplier(): number { return this.config?.boss?.defenceMultiplier ?? 0.8; }

  private scaleBySpeed(def: AttackDef, speedMult: number): AttackDef {
    return {
      ...def,
      telegraphDuration: def.telegraphDuration / speedMult,
      attackDuration:    def.attackDuration    / speedMult,
      recoveryDuration:  def.recoveryDuration  / speedMult,
    };
  }
}
