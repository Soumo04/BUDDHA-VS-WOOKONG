/**
 * HitFX — pooled impact sparks, explosions, and sweep flashes.
 * Uses instanced meshes for performance. Zero allocations after init.
 */
import * as THREE from 'three';

interface SparkParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

interface FXInstance {
  type: 'sparks' | 'explosion' | 'sweep' | 'staff_trail';
  particles: SparkParticle[];
  active: boolean;
  color: THREE.Color;
}

export class HitFX {
  private scene: THREE.Scene;
  private instances: FXInstance[] = [];
  private readonly MAX_INSTANCES = 12;

  // GPU: single Points mesh for all sparks
  private sparkGeo!: THREE.BufferGeometry;
  private sparkMat!: THREE.PointsMaterial;
  private sparkPoints!: THREE.Points;
  private sparkPositions!: Float32Array;
  private sparkColors!: Float32Array;
  private readonly MAX_SPARKS = 600;
  private sparkCount = 0;

  // Staff trail — line segments
  private trailGeo!: THREE.BufferGeometry;
  private trailMesh!: THREE.Line;
  private trailPositions!: Float32Array;
  private readonly TRAIL_LEN = 12;
  private trailHistory: THREE.Vector3[] = [];
  private trailTimer = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.initSparks();
    this.initTrail();
  }

  /* ------------------------------------------------------------------ */
  /* Public API                                                            */
  /* ------------------------------------------------------------------ */

  /** Spawn a burst of sparks at a world position (player hits boss). */
  spawnHitSparks(position: THREE.Vector3, color: THREE.Color, count = 18): void {
    this.spawnSparks(position, color, count, 6, 0.25);
  }

  /** Big explosion (palm slam impact, finisher). */
  spawnExplosion(position: THREE.Vector3, color: THREE.Color): void {
    this.spawnSparks(position, color, 45, 12, 0.6);
  }

  /** Wide sweep flash */
  spawnSweep(origin: THREE.Vector3, color: THREE.Color): void {
    this.spawnSparks(origin, color, 30, 8, 0.4);
  }

  /** Player hit by boss — red sparks */
  spawnPlayerHit(position: THREE.Vector3): void {
    this.spawnSparks(position, new THREE.Color(0xff2020), 20, 5, 0.3);
  }

  /** Update staff position for trail. */
  updateStaffTrail(tipPosition: THREE.Vector3, isAttacking: boolean): void {
    this.trailTimer += 1;
    if (isAttacking && this.trailTimer % 2 === 0) {
      this.trailHistory.unshift(tipPosition.clone());
      if (this.trailHistory.length > this.TRAIL_LEN) {
        this.trailHistory.length = this.TRAIL_LEN;
      }
    } else if (!isAttacking) {
      this.trailHistory = [];
    }
    this.updateTrailGPU();
  }

  update(dt: number): void {
    this.sparkCount = 0;
    const p  = this.sparkPositions;
    const c  = this.sparkColors;

    for (const inst of this.instances) {
      if (!inst.active) continue;
      let anyAlive = false;

      for (const spark of inst.particles) {
        if (spark.life <= 0) continue;
        spark.life -= dt;
        if (spark.life <= 0) continue;

        anyAlive = true;
        spark.position.addScaledVector(spark.velocity, dt);
        spark.velocity.y -= 9.8 * dt; // gravity
        spark.velocity.multiplyScalar(1 - 2 * dt); // drag

        if (this.sparkCount < this.MAX_SPARKS) {
          const i = this.sparkCount;
          p[i * 3]     = spark.position.x;
          p[i * 3 + 1] = spark.position.y;
          p[i * 3 + 2] = spark.position.z;

          const fade = spark.life / spark.maxLife;
          c[i * 3]     = inst.color.r * fade;
          c[i * 3 + 1] = inst.color.g * fade;
          c[i * 3 + 2] = inst.color.b * fade;

          this.sparkCount++;
        }
      }

      if (!anyAlive) inst.active = false;
    }

    // Zero unused
    for (let i = this.sparkCount; i < this.MAX_SPARKS; i++) {
      p[i*3] = p[i*3+1] = p[i*3+2] = 0;
      c[i*3] = c[i*3+1] = c[i*3+2] = 0;
    }

    (this.sparkGeo.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
    (this.sparkGeo.attributes['color']    as THREE.BufferAttribute).needsUpdate = true;
    this.sparkGeo.setDrawRange(0, this.sparkCount);
  }

  /* ------------------------------------------------------------------ */
  /* Internal                                                              */
  /* ------------------------------------------------------------------ */

  private spawnSparks(
    pos: THREE.Vector3,
    color: THREE.Color,
    count: number,
    speed: number,
    maxLife: number,
  ): void {
    let inst = this.instances.find(i => !i.active);
    if (!inst) {
      inst = { type: 'sparks', particles: [], active: true, color: color.clone() };
      this.instances.push(inst);
    } else {
      inst.active = true;
      inst.color.copy(color);
      inst.particles.length = 0;
    }

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.random() * Math.PI;
      const v     = speed * (0.5 + Math.random() * 0.5);
      inst.particles.push({
        position: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.3,
          Math.random() * 0.5,
          (Math.random() - 0.5) * 0.3,
        )),
        velocity: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * v,
          Math.cos(phi) * v * 0.5 + 2,
          Math.sin(phi) * Math.sin(theta) * v,
        ),
        life:    maxLife * (0.6 + Math.random() * 0.4),
        maxLife: maxLife,
        size:    0.06 + Math.random() * 0.1,
      });
    }
  }

  private initSparks(): void {
    this.sparkPositions = new Float32Array(this.MAX_SPARKS * 3);
    this.sparkColors    = new Float32Array(this.MAX_SPARKS * 3);

    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    this.sparkGeo.setAttribute('color',    new THREE.BufferAttribute(this.sparkColors,    3));

    this.sparkMat = new THREE.PointsMaterial({
      size:           0.35,
      vertexColors:   true,
      transparent:    true,
      depthWrite:     false,
      blending:       THREE.AdditiveBlending,
      sizeAttenuation:true,
      map:            this.createCircleTex(),
    });

    this.sparkPoints = new THREE.Points(this.sparkGeo, this.sparkMat);
    this.sparkPoints.frustumCulled = false;
    this.scene.add(this.sparkPoints);
  }

  private initTrail(): void {
    this.trailPositions = new Float32Array(this.TRAIL_LEN * 3);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));

    const mat = new THREE.LineBasicMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.trailMesh = new THREE.Line(this.trailGeo, mat);
    this.trailMesh.frustumCulled = false;
    this.scene.add(this.trailMesh);
  }

  private updateTrailGPU(): void {
    const len = Math.min(this.trailHistory.length, this.TRAIL_LEN);
    for (let i = 0; i < len; i++) {
      const v = this.trailHistory[i];
      this.trailPositions[i * 3]     = v.x;
      this.trailPositions[i * 3 + 1] = v.y;
      this.trailPositions[i * 3 + 2] = v.z;
    }
    (this.trailGeo.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
    this.trailGeo.setDrawRange(0, len);
  }

  private createCircleTex(): THREE.Texture {
    const sz = 32;
    const c  = document.createElement('canvas');
    c.width = c.height = sz;
    const ctx = c.getContext('2d')!;
    const g   = ctx.createRadialGradient(sz/2, sz/2, 0, sz/2, sz/2, sz/2);
    g.addColorStop(0,   'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    g.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, sz, sz);
    return new THREE.CanvasTexture(c);
  }
}
