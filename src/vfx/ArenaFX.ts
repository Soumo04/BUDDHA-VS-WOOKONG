import * as THREE from 'three';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

/**
 * ArenaFX — drifting cloud wisps and golden motes for arena atmosphere.
 * Uses a single Points mesh — one draw call.
 */
export class ArenaFX {
  private particles: Particle[] = [];
  private points!: THREE.Points;
  private geo!: THREE.BufferGeometry;
  private positions!: Float32Array;
  private colors!: Float32Array;
  private sizes!: Float32Array;
  private readonly MAX = 300;
  private spawnTimer = 0;

  constructor(scene: THREE.Scene) {
    this.positions = new Float32Array(this.MAX * 3);
    this.colors    = new Float32Array(this.MAX * 3);
    this.sizes     = new Float32Array(this.MAX);

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color',    new THREE.BufferAttribute(this.colors,    3));
    this.geo.setAttribute('size',     new THREE.BufferAttribute(this.sizes,     1));

    const mat = new THREE.PointsMaterial({
      size: 1.2,
      map: ArenaFX.createCircleTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      alphaTest: 0.001,
    });

    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Pre-spawn some particles
    for (let i = 0; i < 80; i++) this.spawnParticle(Math.random());
  }

  update(dt: number): void {
    this.spawnTimer += dt;
    if (this.spawnTimer > 0.05 && this.particles.length < this.MAX) {
      this.spawnTimer = 0;
      this.spawnParticle(0);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.position.addScaledVector(p.velocity, dt);
    }

    this.uploadToGPU();
  }

  private spawnParticle(lifeOffset: number): void {
    const angle  = Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * 28;
    const maxLife = 6 + Math.random() * 8;

    const isGolden = Math.random() < 0.35;
    const color = isGolden
      ? new THREE.Color(0xd4a017).multiplyScalar(1.5)
      : new THREE.Color(0x9dbad8);

    this.particles.push({
      position: new THREE.Vector3(
        Math.cos(angle) * radius,
        -4 + Math.random() * 10,
        Math.sin(angle) * radius,
      ),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        0.2 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.4,
      ),
      life: maxLife - lifeOffset * maxLife,
      maxLife,
      size: 0.3 + Math.random() * 0.9,
      color,
    });
  }

  private uploadToGPU(): void {
    const count = Math.min(this.particles.length, this.MAX);
    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      const t = p.life / p.maxLife; // 1=new, 0=dead
      const alpha = t < 0.2 ? t / 0.2 : t > 0.8 ? (1 - t) / 0.2 : 1;

      this.positions[i * 3]     = p.position.x;
      this.positions[i * 3 + 1] = p.position.y;
      this.positions[i * 3 + 2] = p.position.z;

      this.colors[i * 3]     = p.color.r * alpha;
      this.colors[i * 3 + 1] = p.color.g * alpha;
      this.colors[i * 3 + 2] = p.color.b * alpha;

      this.sizes[i] = p.size;
    }

    // Zero out unused slots
    for (let i = count; i < this.MAX; i++) {
      this.positions[i * 3] = this.positions[i * 3 + 1] = this.positions[i * 3 + 2] = 0;
      this.colors[i * 3] = this.colors[i * 3 + 1] = this.colors[i * 3 + 2] = 0;
    }

    (this.geo.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes['color']    as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, count);
  }

  /** Create a soft circular gradient texture via Canvas — no file load required. */
  private static createCircleTexture(): THREE.Texture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    grad.addColorStop(0,   'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }
}

