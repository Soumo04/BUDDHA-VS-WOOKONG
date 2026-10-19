import * as THREE from 'three';
import type { EventBus } from '@core/EventBus';

/**
 * Entity — base class for all game objects.
 * Three.js group is the ONLY rendering dependency.
 */
export abstract class Entity {
  readonly scene: THREE.Group = new THREE.Group();

  protected _hp: number;
  protected _maxHp: number;
  protected _isDead = false;

  constructor(maxHp: number) {
    this._hp = maxHp;
    this._maxHp = maxHp;
  }

  get position(): THREE.Vector3 { return this.scene.position; }
  get rotation(): THREE.Euler   { return this.scene.rotation; }
  get hp(): number    { return this._hp; }
  get maxHp(): number { return this._maxHp; }
  get isDead(): boolean { return this._isDead; }
  get hpFraction(): number { return this._hp / this._maxHp; }

  takeDamage(amount: number, _source?: Entity): void {
    if (this._isDead) return;
    this._hp = Math.max(0, this._hp - amount);
    if (this._hp === 0) this.onDeath();
  }

  heal(amount: number): void {
    this._hp = Math.min(this._maxHp, this._hp + amount);
  }

  protected onDeath(): void {
    this._isDead = true;
  }

  abstract update(dt: number, bus: EventBus): void;
}
