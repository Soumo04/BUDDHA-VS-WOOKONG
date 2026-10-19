import * as THREE from 'three';
import type { InputManager } from '@core/InputManager';

export interface CameraTarget {
  position: THREE.Vector3;
  height: number;
}

/**
 * GameCamera — spring-arm third-person with optional lock-on.
 */
export class GameCamera {
  readonly camera: THREE.PerspectiveCamera;

  // Spring-arm settings
  private armLength     = 9;
  private armHeightOff  = 3.5;
  private lookHeightOff = 1.2;
  private freeFOV       = 65;
  private lockFOV       = 60;

  // Angles
  private yaw   = 0;
  private pitch = -0.25; // slight downward tilt
  private readonly MIN_PITCH = -0.6;
  private readonly MAX_PITCH =  0.5;

  // Lock-on state
  private _isLockedOn = false;
  private lockTarget: CameraTarget | null = null;

  // Smoothing
  private currentPos = new THREE.Vector3();
  private currentLook = new THREE.Vector3();
  private readonly LERP_POS  = 8;
  private readonly LERP_ROT  = 10;
  private readonly MOUSE_SENS = 0.003;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(this.freeFOV, aspect, 0.1, 600);
  }

  /** Call each frame with the player entity + optional boss target. */
  update(
    dt: number,
    playerTarget: CameraTarget,
    bossTarget: CameraTarget | null,
    input: InputManager,
  ): void {
    // Mouse/stick look in free mode
    if (!this._isLockedOn) {
      const md = input.mouseDelta;
      this.yaw   -= md.x * this.MOUSE_SENS;
      this.pitch  = Math.max(this.MIN_PITCH,
                    Math.min(this.MAX_PITCH, this.pitch - md.y * this.MOUSE_SENS));
    }

    // Toggle lock-on
    if (input.isJustPressed('LOCK_ON')) {
      this._isLockedOn = !this._isLockedOn;
      if (!this._isLockedOn) this.lockTarget = null;
    }

    if (this._isLockedOn && bossTarget) {
      this.lockTarget = bossTarget;
    } else if (this._isLockedOn && !bossTarget) {
      this._isLockedOn = false;
    }

    // Desired camera position
    const playerPos = playerTarget.position;
    let desiredPos: THREE.Vector3;
    let desiredLook: THREE.Vector3;

    if (this._isLockedOn && this.lockTarget) {
      // Aim midpoint between player and boss
      const bossPos = this.lockTarget.position;
      const mid = new THREE.Vector3().addVectors(playerPos, bossPos).multiplyScalar(0.5);
      const toBoss = new THREE.Vector3().subVectors(bossPos, playerPos).normalize();

      // Position camera to one side behind the player
      const right = new THREE.Vector3().crossVectors(toBoss, new THREE.Vector3(0,1,0)).normalize();
      desiredPos = playerPos.clone()
        .addScaledVector(right, 2)
        .addScaledVector(toBoss, -this.armLength * 0.85)
        .add(new THREE.Vector3(0, this.armHeightOff, 0));
      desiredLook = mid.clone().add(new THREE.Vector3(0, this.lookHeightOff, 0));
    } else {
      // Free spring-arm
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      const sinP = Math.sin(this.pitch);
      const cosP = Math.cos(this.pitch);

      desiredPos = playerPos.clone().add(new THREE.Vector3(
        sinY * cosP * -this.armLength,
        sinP * -this.armLength + this.armHeightOff,
        cosY * cosP * -this.armLength,
      ));
      desiredLook = playerPos.clone().add(new THREE.Vector3(0, this.lookHeightOff, 0));
    }

    // Smooth interpolation
    this.currentPos.lerp(desiredPos, Math.min(1, this.LERP_POS * dt));
    this.currentLook.lerp(desiredLook, Math.min(1, this.LERP_ROT * dt));

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);

    // FOV lerp
    const targetFOV = this._isLockedOn ? this.lockFOV : this.freeFOV;
    this.camera.fov += (targetFOV - this.camera.fov) * Math.min(1, 4 * dt);
    this.camera.updateProjectionMatrix();
  }

  get isLockedOn(): boolean { return this._isLockedOn; }

  /** Get the camera's current yaw angle for movement direction. */
  get cameraYaw(): number { return this.yaw; }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
