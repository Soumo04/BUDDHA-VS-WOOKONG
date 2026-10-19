/**
 * AttackDef — shared data types for all combat events.
 * Kept separate so combat, ai, and vfx can import without circular deps.
 */
import * as THREE from 'three';

/** An attack definition loaded from config JSON. */
export interface AttackDef {
  id: string;
  name: string;
  telegraphDuration: number;
  attackDuration: number;
  recoveryDuration: number;
  damage: number;
  cooldown: number;
  hitRadius?: number;
  hitArc?: number;
  hitRange?: number;
  projectileCount?: number;
  projectileSpeed?: number;
  telegraphType: TelegraphType;
  color: string;
  barrierDuration?: number;
  addCount?: number;
  sweepArc?: number;
  shockwaveRadius?: number;
  shockwaveSpeed?: number;
}

export type TelegraphType =
  | 'shadow_ring'
  | 'orbit_rings'
  | 'arm_glow'
  | 'lotus_spin'
  | 'portal_glow'
  | 'full_body_glow'
  | 'rune_circle'
  | 'foot_glow'
  | 'beam_charge';

/** A resolved hit event passed through the event bus. */
export interface HitEvent {
  attacker: 'player' | 'boss';
  damage: number;
  position: THREE.Vector3;
  attackId?: string;
}

/** Active projectile managed by BossAI. */
export interface Projectile {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  active: boolean;
  lifetime: number;
}
