import * as THREE from 'three';

const dark = new THREE.MeshStandardMaterial({ color: 0x10121a, roughness: 0.62, metalness: 0.3 });
const white = new THREE.MeshStandardMaterial({ color: 0xf1f1ed, roughness: 0.72 });
const blindfold = new THREE.MeshStandardMaterial({ color: 0x030407, roughness: 0.42, metalness: 0.2 });
export class SatoroBozo {
  constructor(scene, id) {
    this.id = id;
    this.agent = 'satoro';
    this.group = new THREE.Group();
    this.group.name = `Satoro Bozo ${id}`;
    this.movementAmount = 0;
    this.parts = [];

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.43, 0.78, 6), dark);
    torso.position.y = 1.08;
    this.group.add(torso);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.28, 6), dark);
    collar.position.y = 1.57;
    this.group.add(collar);

    const head = new THREE.Group();
    head.position.y = 1.82;
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.43, 0.34), white);
    head.add(face);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.17, 0.38), blindfold);
    band.position.set(0, 0.07, -0.02);
    head.add(band);
    for (const [x, lean] of [[-0.16, -0.24], [-0.06, -0.1], [0.06, 0.1], [0.16, 0.24]]) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.44, 5), white);
      spike.position.set(x, 0.37, 0);
      spike.rotation.z = lean;
      head.add(spike);
    }
    this.group.add(head);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.68, 6), dark);
      arm.position.set(side * 0.48, 1.05, 0);
      arm.rotation.z = side * -0.12;
      this.group.add(arm);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.7, 6), dark);
      leg.position.set(side * 0.2, 0.36, 0);
      this.group.add(leg);
      this.parts.push({ arm, leg, side });
    }

    const aura = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.035, 5, 28),
      new THREE.MeshBasicMaterial({ color: 0x85eaff, transparent: true, opacity: 0.65 }),
    );
    aura.position.y = 1;
    aura.rotation.x = Math.PI / 2;
    this.group.add(aura);
    this.aura = aura;
    scene.add(this.group);
  }

  setMoveSpeed(speed) {
    this.movementAmount = THREE.MathUtils.clamp(speed / 6, 0, 1);
  }

  setCrouching(enabled) {
    this.group.scale.y = enabled ? 0.61 : 1;
  }

  update(time) {
    this.parts.forEach(({ arm, leg, side }) => {
      const swing = Math.sin(time * 10 + (side < 0 ? Math.PI : 0)) * 0.5 * this.movementAmount;
      arm.rotation.x = swing;
      leg.rotation.x = -swing;
    });
    this.aura.rotation.z = time * 0.4;
  }

  showEffect(color = 0x31c8ff, lifetime = 500) {
    const effect = new THREE.Mesh(
      new THREE.SphereGeometry(0.8, 8, 6),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72, wireframe: true }),
    );
    effect.position.y = 1;
    this.group.add(effect);
    window.setTimeout(() => {
      this.group.remove(effect);
      effect.geometry.dispose();
      effect.material.dispose();
    }, lifetime);
  }

  dispose() {
    this.group.traverse((object) => {
      if (object.isMesh) object.geometry.dispose();
    });
    this.group.parent?.remove(this.group);
  }
}
