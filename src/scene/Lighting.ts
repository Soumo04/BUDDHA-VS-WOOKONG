import * as THREE from 'three';

/**
 * SceneLighting — dusk directional + ambient + hemisphere.
 * Transitions between phases are animated smoothly.
 */
export class SceneLighting {
  private sun!: THREE.DirectionalLight;
  private ambient!: THREE.AmbientLight;
  private hemi!: THREE.HemisphereLight;
  private targetSunColor = new THREE.Color(0xff8c42);
  private currentPhase: 1 | 2 | 3 = 1;

  constructor(scene: THREE.Scene) {
    // Directional "sun" — soft warm dusk
    this.sun = new THREE.DirectionalLight(0xffc57a, 1.4);
    this.sun.position.set(20, 40, 15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far  = 200;
    this.sun.shadow.camera.left = -60;
    this.sun.shadow.camera.right = 60;
    this.sun.shadow.camera.top   = 60;
    this.sun.shadow.camera.bottom = -60;
    this.sun.shadow.bias = -0.001;
    scene.add(this.sun);

    // Ambient — balanced cool fill light
    this.ambient = new THREE.AmbientLight(0x8090b0, 1.0);
    scene.add(this.ambient);

    // Hemisphere — sky (purple-blue) / ground (warm sand)
    this.hemi = new THREE.HemisphereLight(0x6080c0, 0xc4a060, 0.5);
    scene.add(this.hemi);

    // Target reference
    this.targetSunColor.copy(this.sun.color);
  }

  /** Call on every phase transition. */
  setPhase(phase: 1 | 2 | 3): void {
    if (this.currentPhase === phase) return;
    this.currentPhase = phase;

    switch (phase) {
      case 2:
        this.targetSunColor.set(0xffcc00);
        break;
      case 3:
        this.targetSunColor.set(0xff4400);
        break;
    }
  }

  update(dt: number): void {
    // Smoothly lerp sun colour toward target
    this.sun.color.lerp(this.targetSunColor, dt * 0.8);

    // Subtle flicker in phase 3
    if (this.currentPhase === 3) {
      this.sun.intensity = 2.5 + Math.sin(Date.now() * 0.003) * 0.3;
    }
  }
}
