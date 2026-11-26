import * as THREE from 'three';

export class Zorbao {
  constructor(scene, id) {
    this.id = id;
    this.agent = 'zorbao';
    this.group = new THREE.Group();
    this.group.name = `Zorbão ${id}`;
    this.bodyMotion = new THREE.Group();
    this.group.add(this.bodyMotion);
    this.limbs = [];
    this.movementAmount = 0;

    const armor = new THREE.MeshStandardMaterial({ color: 0x9caab5, roughness: 0.38, metalness: 0.72 });
    const ice = new THREE.MeshStandardMaterial({
      color: 0x8feaff,
      emissive: 0x23a9e3,
      emissiveIntensity: 1.8,
      roughness: 0.22,
      metalness: 0.32,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x263542, roughness: 0.64, metalness: 0.5 });
    const visor = new THREE.MeshStandardMaterial({
      color: 0x48cbf3,
      emissive: 0x168bb9,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });
    const box = (parent, size, position, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    };
    const cylinder = (parent, top, bottom, height, position, material, sides = 6) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, sides), material);
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    };

    cylinder(this.bodyMotion, 0.42, 0.49, 0.82, [0, 1.08, 0], armor, 7);
    box(this.bodyMotion, [0.78, 0.2, 0.42], [0, 0.62, 0], dark);
    box(this.bodyMotion, [0.82, 0.18, 0.48], [0, 1.38, 0], ice);
    box(this.bodyMotion, [0.24, 0.48, 0.12], [0, 1.08, -0.25], dark);

    const hood = new THREE.Mesh(new THREE.IcosahedronGeometry(0.37, 1), dark);
    hood.position.set(0, 1.82, 0.02);
    hood.scale.set(1.05, 1.12, 0.95);
    this.bodyMotion.add(hood);
    box(this.bodyMotion, [0.4, 0.16, 0.15], [0, 1.8, -0.31], visor);
    box(this.bodyMotion, [0.16, 0.22, 0.12], [0, 1.65, -0.3], armor);

    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.52, 1.37, 0);
      this.bodyMotion.add(shoulder);
      const shoulderPad = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), armor);
      shoulderPad.position.y = 0.02;
      shoulderPad.scale.set(1.3, 0.8, 1.05);
      shoulder.add(shoulderPad);
      cylinder(shoulder, 0.17, 0.2, 0.48, [0, -0.32, 0], dark);
      const forearm = new THREE.Group();
      forearm.position.y = -0.53;
      shoulder.add(forearm);
      box(forearm, [0.28, 0.38, 0.3], [0, -0.18, -0.01], armor);
      this.limbs.push({ kind: 'arm', pivot: shoulder, phase: side < 0 ? Math.PI : 0 });
      if (side < 0) {
        const crystalShield = new THREE.Mesh(new THREE.OctahedronGeometry(0.54, 0), ice);
        crystalShield.position.set(-0.02, -0.27, -0.2);
        crystalShield.scale.set(0.78, 1.2, 0.24);
        forearm.add(crystalShield);
        box(forearm, [0.08, 0.38, 0.12], [0, -0.26, -0.32], dark);
      }

      const hip = new THREE.Group();
      hip.position.set(side * 0.23, 0.65, 0);
      this.bodyMotion.add(hip);
      cylinder(hip, 0.17, 0.2, 0.36, [0, -0.18, 0], dark);
      box(hip, [0.29, 0.2, 0.42], [0, -0.4, -0.08], armor);
      box(hip, [0.34, 0.12, 0.45], [0, -0.48, -0.07], ice);
      this.limbs.push({ kind: 'leg', pivot: hip, phase: side < 0 ? 0 : Math.PI });
    }

    this.thermalShield = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x5bcfff,
        emissive: 0x168fe4,
        emissiveIntensity: 1.8,
        transparent: true,
        opacity: 0.19,
        wireframe: true,
        depthWrite: false,
      }),
    );
    this.thermalShield.position.y = 1;
    this.thermalShield.visible = false;
    this.group.add(this.thermalShield);
    this.stormRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.035, 5, 24),
      new THREE.MeshBasicMaterial({ color: 0x9ceeff, transparent: true, opacity: 0.62 }),
    );
    this.stormRing.position.y = 0.2;
    this.stormRing.rotation.x = Math.PI / 2;
    this.stormRing.visible = false;
    this.group.add(this.stormRing);

    scene.add(this.group);
  }

  setMoveSpeed(speed) {
    this.movementAmount = THREE.MathUtils.clamp(speed / 6, 0, 1);
  }

  setCrouching(enabled) {
    this.group.scale.y = enabled ? 0.61 : 1;
  }

  setThermalShield(enabled) {
    this.thermalShield.visible = enabled;
  }

  setStorm(enabled) {
    this.stormRing.visible = enabled;
  }

  update(time) {
    this.limbs.forEach(({ kind, pivot, phase }) => {
      const swing = Math.sin(time * 8 + phase) * 0.36 * this.movementAmount;
      pivot.rotation.x = kind === 'leg' ? -swing : swing;
    });
    this.bodyMotion.position.y = Math.abs(Math.sin(time * 8)) * 0.018 * this.movementAmount;
    this.stormRing.rotation.z = -time * 0.75;
  }

  dispose() {
    const geometries = new Set();
    const materials = new Set();
    this.group.traverse((object) => {
      if (!object.isMesh) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    this.group.parent?.remove(this.group);
  }
}
