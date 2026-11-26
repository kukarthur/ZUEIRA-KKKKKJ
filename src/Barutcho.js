import * as THREE from 'three';

export class Barutcho {
  constructor(scene, id) {
    this.id = id;
    this.agent = 'barutcho';
    this.group = new THREE.Group();
    this.group.name = `Barutcho ${id}`;
    this.bodyMotion = new THREE.Group();
    this.group.add(this.bodyMotion);
    this.limbs = [];
    this.movementAmount = 0;

    const suit = new THREE.MeshStandardMaterial({ color: 0xe7edf0, roughness: 0.58, metalness: 0.28 });
    const gold = new THREE.MeshStandardMaterial({
      color: 0xc98d2b,
      emissive: 0x7d4b0d,
      emissiveIntensity: 0.7,
      roughness: 0.42,
      metalness: 0.58,
    });
    const graphite = new THREE.MeshStandardMaterial({ color: 0x202a32, roughness: 0.68, metalness: 0.4 });
    const visor = new THREE.MeshStandardMaterial({
      color: 0xffbd59,
      emissive: 0xf37f16,
      emissiveIntensity: 2.8,
      roughness: 0.22,
      metalness: 0.28,
    });
    const thrusterMaterial = new THREE.MeshStandardMaterial({
      color: 0x4bdcff,
      emissive: 0x13b7e9,
      emissiveIntensity: 2.4,
      roughness: 0.24,
    });
    const box = (parent, size, position, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    };
    const cylinder = (parent, top, bottom, height, position, material, sides = 7) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, sides), material);
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    };

    cylinder(this.bodyMotion, 0.36, 0.43, 0.76, [0, 1.08, 0], suit, 7);
    box(this.bodyMotion, [0.73, 0.2, 0.38], [0, 0.64, 0], graphite);
    box(this.bodyMotion, [0.76, 0.18, 0.43], [0, 1.36, 0], gold);
    box(this.bodyMotion, [0.2, 0.44, 0.11], [0, 1.08, -0.22], graphite);

    const helmet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.31, 1), suit);
    helmet.position.set(0, 1.82, 0);
    helmet.scale.set(1, 1.08, 0.98);
    this.bodyMotion.add(helmet);
    const faceplate = box(this.bodyMotion, [0.43, 0.22, 0.12], [0, 1.82, -0.27], visor);
    faceplate.rotation.x = -0.08;
    box(this.bodyMotion, [0.5, 0.1, 0.42], [0, 2.1, 0], gold);
    box(this.bodyMotion, [0.12, 0.13, 0.12], [-0.28, 1.81, 0], graphite);
    box(this.bodyMotion, [0.12, 0.13, 0.12], [0.28, 1.81, 0], graphite);

    const backpack = new THREE.Group();
    backpack.position.set(0, 1.1, 0.32);
    this.bodyMotion.add(backpack);
    box(backpack, [0.52, 0.56, 0.3], [0, 0.04, 0.08], graphite);
    box(backpack, [0.58, 0.12, 0.34], [0, 0.28, 0.06], gold);
    this.thrusters = [];
    for (const side of [-1, 1]) {
      cylinder(backpack, 0.12, 0.15, 0.48, [side * 0.26, -0.08, 0.1], suit, 6);
      const nozzle = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.23, 6), thrusterMaterial);
      nozzle.position.set(side * 0.26, -0.43, 0.1);
      nozzle.rotation.x = Math.PI;
      backpack.add(nozzle);
      this.thrusters.push(nozzle);
    }

    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.48, 1.35, 0);
      this.bodyMotion.add(shoulder);
      box(shoulder, [0.3, 0.24, 0.38], [0, -0.02, 0], gold);
      cylinder(shoulder, 0.13, 0.15, 0.45, [0, -0.3, 0], suit, 6);
      const forearm = new THREE.Group();
      forearm.position.y = -0.5;
      shoulder.add(forearm);
      box(forearm, [0.23, 0.34, 0.26], [0, -0.17, -0.02], graphite);
      box(forearm, [0.25, 0.12, 0.28], [0, -0.34, -0.02], suit);
      this.limbs.push({ kind: 'arm', pivot: shoulder, phase: side < 0 ? Math.PI : 0 });

      const hip = new THREE.Group();
      hip.position.set(side * 0.22, 0.65, 0);
      this.bodyMotion.add(hip);
      cylinder(hip, 0.14, 0.17, 0.35, [0, -0.17, 0], graphite, 6);
      const boot = box(hip, [0.24, 0.18, 0.39], [0, -0.39, -0.07], suit);
      boot.rotation.x = 0.06;
      this.limbs.push({ kind: 'leg', pivot: hip, phase: side < 0 ? 0 : Math.PI });
    }

    this.boostActive = false;

    scene.add(this.group);
  }

  setMoveSpeed(speed) {
    this.movementAmount = THREE.MathUtils.clamp(speed / 6, 0, 1);
  }

  setCrouching(enabled) {
    this.group.scale.y = enabled ? 0.61 : 1;
  }

  setBoost(enabled) {
    this.boostActive = enabled;
    for (const nozzle of this.thrusters) nozzle.visible = enabled;
  }

  update(time) {
    this.limbs.forEach(({ kind, pivot, phase }) => {
      const swing = Math.sin(time * 10 + phase) * 0.48 * this.movementAmount;
      pivot.rotation.x = kind === 'leg' ? -swing : swing;
    });
    this.bodyMotion.position.y = Math.abs(Math.sin(time * 10)) * 0.025 * this.movementAmount;
    if (this.boostActive) {
      this.thrusters.forEach((nozzle, index) => {
        nozzle.scale.y = 0.8 + Math.abs(Math.sin(time * 18 + index)) * 0.8;
      });
    }
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
