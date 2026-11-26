import * as THREE from 'three';

const FURY_MELEE_RADIUS = 4.5;
const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x111117, roughness: 0.7, metalness: 0.35 });
const armorMaterial = new THREE.MeshStandardMaterial({ color: 0x250d16, roughness: 0.55, metalness: 0.42 });
const redMaterial = new THREE.MeshStandardMaterial({
  color: 0x8e142d,
  emissive: 0x721027,
  emissiveIntensity: 3,
  roughness: 0.48,
  metalness: 0.32,
});
const blackTentacleMaterial = new THREE.MeshStandardMaterial({ color: 0x17141c, roughness: 0.46, metalness: 0.55 });
const hairMaterial = new THREE.MeshStandardMaterial({ color: 0xf0f0ec, roughness: 0.82 });
const maskMaterial = new THREE.MeshStandardMaterial({ color: 0x050609, roughness: 0.52, metalness: 0.24 });
const eyeMaterial = new THREE.MeshStandardMaterial({
  color: 0xff244d,
  emissive: 0xff123e,
  emissiveIntensity: 4,
  roughness: 0.25,
});

function box(parent, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent, radiusTop, radiusBottom, height, position, material, radialSegments = 7) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    material,
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

export class CrimsonStalker {
  constructor(scene, id) {
    this.id = id;
    this.agent = 'kaneca';
    this.group = new THREE.Group();
    this.group.name = `Kaneca ${id}`;
    this.tentacles = [];
    this.limbs = [];
    this.effects = [];
    this.fury = false;
    this.shield = false;
    this.movementAmount = 0;
    this.bodyMotion = new THREE.Group();
    this.group.add(this.bodyMotion);
    this.buildBody();
    this.buildTentacles();
    this.buildShield();
    this.materials = new Set();
    this.baseEmissiveIntensity = new Map();
    this.group.traverse((object) => {
      if (!object.isMesh && !object.isLineSegments) return;
      object.material = object.material.clone();
      this.materials.add(object.material);
      if (object.material.emissive) {
        this.baseEmissiveIntensity.set(object.material, object.material.emissiveIntensity);
      }
    });
    scene.add(this.group);
  }

  buildBody() {
    const body = this.bodyMotion;
    const torso = cylinder(body, 0.34, 0.43, 0.76, [0, 1.08, 0], armorMaterial, 6);
    torso.rotation.y = Math.PI / 6;
    box(body, [0.74, 0.25, 0.36], [0, 1.33, -0.02], darkMaterial);
    box(body, [0.68, 0.18, 0.4], [0, 0.62, 0], darkMaterial);

    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.5, 1.32, 0);
      body.add(shoulder);
      cylinder(shoulder, 0.14, 0.17, 0.48, [0, -0.25, 0], darkMaterial, 6);
      const elbow = new THREE.Group();
      elbow.position.y = -0.48;
      shoulder.add(elbow);
      cylinder(elbow, 0.1, 0.12, 0.38, [0, -0.19, 0], armorMaterial, 6);
      box(elbow, [0.18, 0.13, 0.2], [0, -0.39, -0.025], redMaterial);
      this.limbs.push({ kind: 'arm', pivot: shoulder, phase: side < 0 ? Math.PI : 0 });

      const hip = new THREE.Group();
      hip.position.set(side * 0.22, 0.62, 0);
      body.add(hip);
      cylinder(hip, 0.14, 0.17, 0.34, [0, -0.17, 0], darkMaterial, 6);
      const knee = new THREE.Group();
      knee.position.y = -0.34;
      hip.add(knee);
      cylinder(knee, 0.1, 0.12, 0.32, [0, -0.16, 0], armorMaterial, 6);
      box(knee, [0.22, 0.13, 0.34], [0, -0.34, -0.08], darkMaterial);
      this.limbs.push({ kind: 'leg', pivot: hip, knee, phase: side < 0 ? 0 : Math.PI });
    }

    const head = new THREE.Group();
    head.position.set(0, 1.72, 0);
    body.add(head);
    cylinder(head, 0.23, 0.25, 0.48, [0, 0, 0], darkMaterial, 7);
    box(head, [0.39, 0.23, 0.31], [0, -0.12, -0.015], maskMaterial);
    box(head, [0.12, 0.07, 0.1], [-0.105, 0.045, -0.205], eyeMaterial);
    box(head, [0.08, 0.045, 0.08], [0.105, 0.045, -0.21], maskMaterial);

    const hairRoots = [
      [-0.18, 0.22, 0.02, -0.25],
      [-0.07, 0.24, 0.04, -0.08],
      [0.07, 0.23, 0.03, 0.1],
      [0.17, 0.2, 0.02, 0.3],
      [-0.12, 0.19, 0.11, -0.32],
      [0.1, 0.2, 0.1, 0.24],
    ];
    for (const [x, y, z, lean] of hairRoots) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.43, 5), hairMaterial);
      spike.position.set(x, y, z);
      spike.rotation.z = lean;
      spike.rotation.x = -0.2;
      head.add(spike);
    }
  }

  buildTentacles() {
    const segmentGeometry = new THREE.CylinderGeometry(0.13, 0.19, 0.78, 6);
    const specs = [
      { x: -0.28, y: 1.34, reach: -0.1, phase: 0 },
      { x: 0.28, y: 1.34, reach: 0.1, phase: 1.3 },
      { x: -0.22, y: 1.02, reach: -0.35, phase: 2.2 },
      { x: 0.22, y: 1.02, reach: 0.35, phase: 3.4 },
    ];

    specs.forEach((spec, index) => {
      const root = new THREE.Group();
      root.position.set(spec.x, spec.y, 0.24);
      root.rotation.x = 0.88;
      root.rotation.z = spec.reach;
      this.group.add(root);
      let joint = root;
      const joints = [];
      for (let segment = 0; segment < 4; segment++) {
        const material = segment % 2 === 0 ? redMaterial : blackTentacleMaterial;
        const part = new THREE.Mesh(segmentGeometry, material);
        part.position.z = 0.39;
        part.rotation.x = Math.PI / 2;
        joint.add(part);

        const next = new THREE.Group();
        next.position.z = 0.74;
        joint.add(next);
        joints.push(next);
        joint = next;
      }
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 6), redMaterial);
      tip.position.z = 0.26;
      tip.rotation.x = Math.PI / 2;
      joint.add(tip);
      this.tentacles.push({ root, joints, index, phase: spec.phase });
    });
  }

  buildShield() {
    this.shieldGroup = new THREE.Group();
    this.shieldGroup.position.set(0, 1, -0.76);
    this.shieldGroup.visible = false;
    const shieldMaterial = new THREE.MeshStandardMaterial({
      color: 0xff1e56,
      emissive: 0x9b0c2e,
      emissiveIntensity: 2.3,
      transparent: true,
      opacity: 0.36,
      roughness: 0.24,
      metalness: 0.24,
      side: THREE.DoubleSide,
    });
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.85, 0.08), shieldMaterial);
    this.shieldGroup.add(shield);
    const frame = new THREE.LineSegments(
      new THREE.EdgesGeometry(shield.geometry),
      new THREE.LineBasicMaterial({ color: 0xff476e, transparent: true, opacity: 0.9 }),
    );
    this.shieldGroup.add(frame);
    this.group.add(this.shieldGroup);
  }

  setShield(enabled) {
    this.shield = enabled;
    this.shieldGroup.visible = enabled;
  }

  setMoveSpeed(speed) {
    this.movementAmount = THREE.MathUtils.clamp(speed / 6, 0, 1);
  }

  setCrouching(enabled) {
    this.group.scale.y = enabled ? 0.61 : 1;
  }

  setFury(enabled) {
    this.fury = enabled;
    for (const [material, baseIntensity] of this.baseEmissiveIntensity) {
      material.emissiveIntensity = enabled ? baseIntensity + 1.5 : baseIntensity;
    }
  }

  showWhip(fury = false) {
    if (fury) {
      const effect = new THREE.Mesh(
        new THREE.TorusGeometry(FURY_MELEE_RADIUS, 0.08, 5, 32),
        new THREE.MeshStandardMaterial({
          color: 0xff244d,
          emissive: 0xd10e38,
          emissiveIntensity: 2,
          transparent: true,
          opacity: 0.9,
        }),
      );
      effect.position.y = 0.1;
      effect.rotation.x = Math.PI / 2;
      this.group.add(effect);
      this.effects.push({ object: effect, expires: performance.now() + 320 });
      return;
    }
    const points = [
      new THREE.Vector3(0, 1.05, -0.25),
      new THREE.Vector3(0, 1.05, -3.2),
      new THREE.Vector3(0, 1.05, -7.5),
      new THREE.Vector3(0, 1.05, -10),
    ];
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 10, 0.07, 5, false);
    const material = new THREE.MeshStandardMaterial({
      color: 0xff244d,
      emissive: 0xd10e38,
      emissiveIntensity: 2,
    });
    const effect = new THREE.Mesh(geometry, material);
    this.group.add(effect);
    this.effects.push({ object: effect, expires: performance.now() + 260 });
  }

  showDash() {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.045, 5, 18),
      new THREE.MeshStandardMaterial({
        color: 0xff244d,
        emissive: 0xd10e38,
        emissiveIntensity: 2,
        transparent: true,
        opacity: 0.85,
      }),
    );
    ring.position.y = 0.7;
    ring.rotation.x = Math.PI / 2;
    this.group.add(ring);
    this.effects.push({ object: ring, expires: performance.now() + 320 });
  }

  update(time) {
    const walkCycle = time * 10;
    const walkBlend = this.movementAmount;
    this.bodyMotion.position.y = Math.abs(Math.sin(walkCycle * 2)) * 0.035 * walkBlend;
    for (const limb of this.limbs) {
      const swing = Math.sin(walkCycle + limb.phase) * 0.58 * walkBlend;
      limb.pivot.rotation.x = swing;
      if (limb.knee) {
        limb.knee.rotation.x = Math.max(0, Math.sin(walkCycle + limb.phase + 0.7)) * 0.62 * walkBlend;
      }
    }

    for (const tentacle of this.tentacles) {
      const wave = time * (this.fury ? 4.2 : 2.2) + tentacle.phase;
      tentacle.root.rotation.z = Math.sin(wave) * 0.22 + (tentacle.index % 2 ? 0.16 : -0.16);
      tentacle.root.rotation.x = 0.88 + Math.cos(wave * 0.8) * 0.16;
      tentacle.joints.forEach((joint, index) => {
        joint.rotation.x = Math.sin(wave - index * 0.8) * 0.18;
        joint.rotation.y = Math.cos(wave + index) * 0.1;
      });
    }

    const now = performance.now();
    this.effects = this.effects.filter(({ object, expires }) => {
      if (now < expires) return true;
      this.group.remove(object);
      object.geometry.dispose();
      object.material.dispose();
      return false;
    });
  }

  dispose() {
    for (const effect of this.effects) {
      this.group.remove(effect.object);
      effect.object.geometry.dispose();
      effect.object.material.dispose();
    }
    this.group.traverse((object) => {
      if (object.isMesh || object.isLineSegments) {
        object.geometry.dispose();
      }
    });
    for (const material of this.materials) material.dispose();
    this.group.parent?.remove(this.group);
  }
}
