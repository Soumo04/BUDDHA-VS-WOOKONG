import * as THREE from 'three';
import type { Wukong } from '@entities/Wukong';
import type { Buddha } from '@entities/Buddha';
import type { EventBus } from '@core/EventBus';

/**
 * HitDetector — resolves player attacks against boss (and later boss attacks against player).
 * Sphere-overlap based, runs after all entities update each frame.
 */
export class HitDetector {
  private scene: THREE.Scene;
  private readonly DEBUG = false;
  private debugHelpers: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  resolve(
    wukong: Wukong,
    buddha: Buddha,
    bus: EventBus,
  ): void {
    if (wukong.isDead || buddha.isDead) return;

    // Player → Boss hit resolution
    for (const atk of wukong.pendingAttacks) {
      const dist = wukong.position.distanceTo(buddha.position);
      if (dist <= atk.range + 1.5 /* boss radius */) {
        buddha.takeDamage(atk.damage, wukong);
        bus.emit('boss:hit', {
          damage: atk.damage,
          position: {
            x: buddha.position.x,
            y: buddha.position.y + 1,
            z: buddha.position.z,
          },
        });

        if (buddha.isDead) {
          bus.emit('boss:died');
        }
      }
    }
  }
}
