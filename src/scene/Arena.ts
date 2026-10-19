import * as THREE from 'three';

/**
 * Arena — cloud-top temple platform geometry.
 * Greybox: procedural geometry; will be replaced by GLB in M5.
 */
export class Arena {
  readonly group = new THREE.Group();
  readonly radius = 30;

  /** Visible boundary ring used for Phase 3 arena shrink. */
  private boundaryRing!: THREE.Mesh;
  private clouds: THREE.Mesh[] = [];
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    this.buildFloor();
    this.buildColumns();
    this.buildCloudPlane();
    this.buildBoundaryRing();
    this.buildSkyDome();
    scene.add(this.group);
  }

  /* ------------------------------------------------------------------ */

  private buildFloor(): void {
    // Main circular marble platform
    const geo = new THREE.CylinderGeometry(this.radius, this.radius + 1, 0.8, 64);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd4c5a9,
      roughness: 0.35,
      metalness: 0.1,
    });
    const floor = new THREE.Mesh(geo, mat);
    floor.receiveShadow = true;
    floor.position.y = -0.4;
    this.group.add(floor);

    // Gold trim ring
    const trimGeo = new THREE.TorusGeometry(this.radius, 0.25, 8, 64);
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xd4a017,
      roughness: 0.2,
      metalness: 0.8,
      emissive: new THREE.Color(0xd4a017),
      emissiveIntensity: 0.3,
    });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.1;
    this.group.add(trim);

    // Inner decorative ring
    const innerTrimGeo = new THREE.TorusGeometry(this.radius * 0.6, 0.12, 6, 64);
    const innerTrim = new THREE.Mesh(innerTrimGeo, trimMat);
    innerTrim.rotation.x = Math.PI / 2;
    innerTrim.position.y = 0.05;
    this.group.add(innerTrim);

    // Centre lotus pattern (flat disc)
    const lotusGeo = new THREE.CircleGeometry(3, 12);
    const lotusMat = new THREE.MeshStandardMaterial({
      color: 0xd4a017,
      roughness: 0.3,
      metalness: 0.5,
      emissive: new THREE.Color(0xd4a017),
      emissiveIntensity: 0.15,
    });
    const lotus = new THREE.Mesh(lotusGeo, lotusMat);
    lotus.rotation.x = -Math.PI / 2;
    lotus.position.y = 0.05;
    this.group.add(lotus);
  }

  private buildColumns(): void {
    const colMat = new THREE.MeshStandardMaterial({
      color: 0xc8b89a,
      roughness: 0.5,
      metalness: 0.05,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xd4a017,
      roughness: 0.2,
      metalness: 0.7,
      emissive: new THREE.Color(0xd4a017),
      emissiveIntensity: 0.2,
    });

    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = Math.cos(angle) * (this.radius - 2);
      const z = Math.sin(angle) * (this.radius - 2);

      // Shaft
      const shaftGeo = new THREE.CylinderGeometry(0.4, 0.5, 6, 8);
      const shaft = new THREE.Mesh(shaftGeo, colMat);
      shaft.position.set(x, 3, z);
      shaft.castShadow = true;
      this.group.add(shaft);

      // Capital
      const capGeo = new THREE.BoxGeometry(1.2, 0.4, 1.2);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(x, 6.2, z);
      this.group.add(cap);
    }
  }

  private buildCloudPlane(): void {
    // Drifting cloud layer below the platform
    const cloudGeo = new THREE.PlaneGeometry(500, 500, 1, 1);
    const cloudMat = new THREE.MeshBasicMaterial({
      color: 0xe8ddd0,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    const cloudPlane = new THREE.Mesh(cloudGeo, cloudMat);
    cloudPlane.rotation.x = -Math.PI / 2;
    cloudPlane.position.y = -12;
    this.group.add(cloudPlane);

    // Fluffy cloud blobs using sphere clusters
    const cloudMat2 = new THREE.MeshStandardMaterial({
      color: 0xf0ebe3,
      roughness: 1,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });

    for (let i = 0; i < 20; i++) {
      const size = 8 + Math.random() * 14;
      const geo = new THREE.SphereGeometry(size, 7, 5);
      const mesh = new THREE.Mesh(geo, cloudMat2);
      const angle = Math.random() * Math.PI * 2;
      const dist  = 60 + Math.random() * 120;
      mesh.position.set(
        Math.cos(angle) * dist,
        -18 + Math.random() * 8,
        Math.sin(angle) * dist,
      );
      mesh.userData['driftSpeed']  = 0.5 + Math.random() * 1.5;
      mesh.userData['driftAngle']  = angle;
      mesh.userData['driftRadius'] = dist;
      mesh.userData['baseY']       = mesh.position.y;
      this.clouds.push(mesh);
      this.group.add(mesh);
    }
  }

  private buildBoundaryRing(): void {
    const geo = new THREE.TorusGeometry(this.radius, 0.15, 6, 64);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe63946,
      emissive: new THREE.Color(0xe63946),
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });
    this.boundaryRing = new THREE.Mesh(geo, mat);
    this.boundaryRing.rotation.x = Math.PI / 2;
    this.boundaryRing.position.y = 0.15;
    this.boundaryRing.visible = false; // shown only in Phase 3
    this.group.add(this.boundaryRing);
  }

  private buildSkyDome(): void {
    // Large inverted sphere for sky gradient — deep purple-blue dusk
    const geo = new THREE.SphereGeometry(380, 32, 16);
    geo.scale(-1, 1, -1);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x1a1035,
    });
    const dome = new THREE.Mesh(geo, mat);
    this.group.add(dome);

    // Second inner dome for gradient horizon effect
    const horizDomeGeo = new THREE.SphereGeometry(200, 24, 8);
    horizDomeGeo.scale(-1, 0.3, -1);
    const horizDomeMat = new THREE.MeshBasicMaterial({
      color: 0x7a3010,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const horizDome = new THREE.Mesh(horizDomeGeo, horizDomeMat);
    horizDome.position.y = -60;
    this.group.add(horizDome);

    // Horizon glow ring
    const horizGeo = new THREE.PlaneGeometry(700, 60);
    const horizMat = new THREE.MeshBasicMaterial({
      color: 0xff6020,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    });
    const horiz = new THREE.Mesh(horizGeo, horizMat);
    horiz.rotation.x = Math.PI / 2;
    horiz.position.y = -25;
    this.group.add(horiz);
  }

  /* ------------------------------------------------------------------ */

  update(dt: number): void {
    this.elapsed += dt;
    for (const cloud of this.clouds) {
      cloud.userData['driftAngle'] += dt * cloud.userData['driftSpeed'] * 0.01;
      const a = cloud.userData['driftAngle'] as number;
      const r = cloud.userData['driftRadius'] as number;
      cloud.position.x = Math.cos(a) * r;
      cloud.position.z = Math.sin(a) * r;
      // Gentle bob
      cloud.position.y = (cloud.userData['baseY'] as number) + Math.sin(this.elapsed * 0.3 + a) * 0.8;
    }
  }

  /** Show Phase-3 boundary ring. */
  showBoundary(): void { this.boundaryRing.visible = true; }
  hideBoundary(): void { this.boundaryRing.visible = false; }
}
