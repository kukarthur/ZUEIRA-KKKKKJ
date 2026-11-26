import * as THREE from 'three';
import {
  getMapDefinition,
  getSolidBounds,
  MAP_HALF_SIZE,
  MAP_SIZE,
  MAP_SOLIDS,
} from './map-data.js';

const neonColors = [0xff1e56, 0x00f0ff, 0xff00aa, 0xffd700];
const buildingColor = new THREE.MeshStandardMaterial({ color: 0x161822, roughness: 0.9 });
const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a24, roughness: 0.96 });
const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x343543, roughness: 0.9 });
const markingMaterial = new THREE.MeshStandardMaterial({ color: 0xd9dbe4, roughness: 0.75 });
const crateMaterial = new THREE.MeshStandardMaterial({ color: 0x58616a, metalness: 0.72, roughness: 0.48 });
const kioskMaterial = new THREE.MeshStandardMaterial({ color: 0x302a3b, metalness: 0.3, roughness: 0.72 });
const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x454954, metalness: 0.55, roughness: 0.65 });

function createNamedColliders(mapId) {
  return getMapDefinition(mapId).solids.map((solid) => {
    const bounds = getSolidBounds(solid);
    return {
      name: solid.name,
      kind: solid.kind,
      box: new THREE.Box3(
        new THREE.Vector3(...bounds.min),
        new THREE.Vector3(...bounds.max),
      ),
    };
  });
}

export const namedColliders = createNamedColliders('shibuya-night');
export const colliders = namedColliders.map(({ box }) => box);

function addBox(scene, size, position, material, rotationY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  scene.add(mesh);
  return mesh;
}

function addInstancedMarkings(scene) {
  const stripes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.55, 0.025, 1.5),
    markingMaterial,
    28,
  );
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (const z of [-2.4, 2.4]) {
    for (let x = -9; x <= 9; x += 1.4) {
      matrix.makeTranslation(x, -0.045, z);
      stripes.setMatrixAt(index++, matrix);
    }
  }
  stripes.count = index;
  stripes.instanceMatrix.needsUpdate = true;
  scene.add(stripes);

  const laneMarks = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.1, 0.018, 2.4),
    markingMaterial,
    26,
  );
  index = 0;
  for (const x of [-3.1, 3.1]) {
    for (let z = -48; z <= 48; z += 7.5) {
      matrix.makeTranslation(x, -0.05, z);
      laneMarks.setMatrixAt(index++, matrix);
    }
  }
  laneMarks.count = index;
  laneMarks.instanceMatrix.needsUpdate = true;
  scene.add(laneMarks);
}

function addWindows(scene) {
  const windowGeometry = new THREE.BoxGeometry(0.85, 1.05, 0.09);
  const windowsWarm = new THREE.InstancedMesh(
    windowGeometry,
    new THREE.MeshStandardMaterial({
      color: 0x7d8d9d,
      emissive: 0x6d8fa8,
      emissiveIntensity: 1.8,
    }),
    320,
  );
  const windowsGold = new THREE.InstancedMesh(
    windowGeometry,
    new THREE.MeshStandardMaterial({
      color: 0xb18a54,
      emissive: 0xffc15b,
      emissiveIntensity: 1.25,
    }),
    320,
  );
  const matrix = new THREE.Matrix4();
  let warmIndex = 0;
  let goldIndex = 0;
  let seed = 193;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (const solid of MAP_SOLIDS.filter(({ kind }) => kind === 'building')) {
    const [x, y, z] = solid.center;
    const [width, height, depth] = solid.size;
    const faceX = x < 0 ? x + width / 2 + 0.055 : x - width / 2 - 0.055;
    const columns = Math.max(2, Math.floor(depth / 3.2));
    const rows = Math.max(2, Math.floor(height / 3.1));

    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        if (random() < 0.2) continue;
        const zOffset = (column - (columns - 1) / 2) * 3.1;
        const yOffset = 2 + row * 2.8;
        const rotation = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          x < 0 ? Math.PI / 2 : -Math.PI / 2,
        );
        matrix.compose(
          new THREE.Vector3(faceX, yOffset, z + zOffset),
          rotation,
          new THREE.Vector3(1, 1, 1),
        );
        if (random() > 0.35 && warmIndex < windowsWarm.instanceMatrix.count) {
          windowsWarm.setMatrixAt(warmIndex++, matrix);
        } else if (goldIndex < windowsGold.instanceMatrix.count) {
          windowsGold.setMatrixAt(goldIndex++, matrix);
        }
      }
    }
  }

  windowsWarm.count = warmIndex;
  windowsGold.count = goldIndex;
  windowsWarm.instanceMatrix.needsUpdate = true;
  windowsGold.instanceMatrix.needsUpdate = true;
  scene.add(windowsWarm, windowsGold);
}

function addNeonSigns(scene) {
  let signIndex = 0;
  MAP_SOLIDS.filter(({ kind }) => kind === 'building').forEach((solid) => {
    const [x, y, z] = solid.center;
    const [width, height, depth] = solid.size;
    const facingX = x < 0 ? x + width / 2 + 0.18 : x - width / 2 - 0.18;
    const spread = Math.min(5, depth * 0.28);
    const signY = Math.max(2.8, y + height / 2 - 4.1);
    for (const zOffset of [-spread, 0, spread]) {
      const color = neonColors[signIndex++ % neonColors.length];
      const signPosition = [facingX, signY, z + zOffset];
      addBox(
        scene,
        [0.34, 7.4, 1.05],
        signPosition,
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 3,
          roughness: 0.32,
          metalness: 0.16,
        }),
      );
      addBox(
        scene,
        [0.48, 7.55, 1.2],
        [facingX + (x < 0 ? -0.08 : 0.08), signY, z + zOffset],
        new THREE.MeshStandardMaterial({ color: 0x10121a, roughness: 0.7 }),
      );
    }
  });
}

function addAlleySigns(scene) {
  for (const [z, color] of [[-7.15, 0x00f0ff], [7.15, 0xff00aa]]) {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 2.8,
      roughness: 0.3,
      metalness: 0.15,
    });
    addBox(scene, [4.5, 0.5, 0.12], [24, 3.1, z], material);
  }
}

function addCars(scene) {
  const bodyGeometry = new THREE.BoxGeometry(4.4, 0.82, 2.1);
  const cabinGeometry = new THREE.BoxGeometry(2.25, 0.66, 1.72);
  const wheelGeometry = new THREE.CylinderGeometry(0.42, 0.42, 0.25, 8);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111217, roughness: 0.95 });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x22343e,
    metalness: 0.3,
    roughness: 0.28,
    emissive: 0x14222a,
    emissiveIntensity: 0.55,
  });

  MAP_SOLIDS.filter(({ kind }) => kind === 'car').forEach((car, index) => {
    const [x, y, z] = car.center;
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: [0x9c253c, 0x426b78, 0x9a7845, 0x484b5d][index],
      metalness: 0.48,
      roughness: 0.42,
    });
    const group = new THREE.Group();
    group.position.set(x, y - 0.28, z);
    group.rotation.y = car.rotationY ?? 0;
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    group.add(body);
    const cabin = new THREE.Mesh(cabinGeometry, glassMaterial);
    cabin.position.set(-0.15, 0.68, 0);
    group.add(cabin);

    for (const wheelX of [-1.35, 1.35]) {
      for (const wheelZ of [-1.05, 1.05]) {
        const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wheelX, -0.28, wheelZ);
        group.add(wheel);
      }
    }
    scene.add(group);
  });
}

function addSiteMarkers(scene) {
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xff1e56,
    emissive: 0xff1e56,
    emissiveIntensity: 1.8,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  for (const x of [-26, 26]) {
    const marker = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.4, 32), markerMaterial);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 0.035, 0);
    scene.add(marker);
  }
}

function addSpawnLights(scene) {
  for (const [z, color] of [[-45, 0x00f0ff], [45, 0xff1e56]]) {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.8,
    });
    addBox(scene, [5, 0.08, 0.45], [0, 0.05, z], material);
  }
}

function createShibuyaMap(scene) {
  scene.background = new THREE.Color(0x121024);
  scene.fog = new THREE.FogExp2(0x121024, 0.015);
  scene.add(new THREE.AmbientLight(0x7584bd, 1.05));
  const moonlight = new THREE.DirectionalLight(0x9fb8e8, 1.7);
  moonlight.position.set(-12, 25, -8);
  scene.add(moonlight);

  addBox(scene, [MAP_HALF_SIZE * 2, 0.12, MAP_HALF_SIZE * 2], [0, -0.12, 0], roadMaterial);
  addBox(scene, [2.1, 0.3, MAP_SIZE - 4], [-11.2, 0.03, 0], sidewalkMaterial);
  addBox(scene, [2.1, 0.3, MAP_SIZE - 4], [11.2, 0.03, 0], sidewalkMaterial);
  addBox(scene, [18, 0.08, 26], [-26, -0.025, 0], sidewalkMaterial);
  addBox(scene, [18, 0.08, 26], [26, -0.025, 0], sidewalkMaterial);
  const ramp = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.18, 5),
    platformMaterial,
  );
  ramp.position.set(22.8, 0.1, 0);
  ramp.rotation.z = -0.035;
  scene.add(ramp);

  for (const solid of MAP_SOLIDS) {
    if (solid.kind === 'car' || solid.kind === 'ramp') continue;
    const material = solid.kind === 'building'
      ? buildingColor
      : solid.kind === 'crate'
        ? crateMaterial
        : solid.kind === 'kiosk'
          ? kioskMaterial
          : solid.kind === 'platform'
            ? platformMaterial
            : new THREE.MeshStandardMaterial({ color: 0x272b35, roughness: 0.85 });
    const mesh = addBox(scene, solid.size, solid.center, material, solid.rotationY ?? 0);
    if (solid.kind === 'kiosk') {
      const roof = addBox(
        scene,
        [4.8, 0.32, 4.8],
        [solid.center[0], solid.center[1] + 1.8, solid.center[2]],
        new THREE.MeshStandardMaterial({
          color: 0xff1e56,
          emissive: 0x6a1025,
          emissiveIntensity: 1.2,
          roughness: 0.6,
        }),
      );
      roof.castShadow = false;
    }
    mesh.castShadow = false;
    mesh.receiveShadow = false;
  }

  addCars(scene);
  addInstancedMarkings(scene);
  addWindows(scene);
  addNeonSigns(scene);
  addAlleySigns(scene);
  addSiteMarkers(scene);
  addSpawnLights(scene);
  return { colliders, namedColliders };
}

const sakuraWood = new THREE.MeshStandardMaterial({ color: 0x745039, roughness: 0.78 });
const sakuraStone = new THREE.MeshStandardMaterial({ color: 0x55515c, roughness: 0.92 });
const sakuraRoof = new THREE.MeshStandardMaterial({
  color: 0x702c3a,
  roughness: 0.68,
  metalness: 0.12,
});
const toriiRed = new THREE.MeshStandardMaterial({
  color: 0xa82d3e,
  roughness: 0.52,
  emissive: 0x3c0714,
  emissiveIntensity: 0.6,
});
const pinkCanopy = new THREE.MeshStandardMaterial({
  color: 0xff8fbd,
  emissive: 0xff3d91,
  emissiveIntensity: 0.72,
  roughness: 0.76,
});
const lanternLight = new THREE.MeshStandardMaterial({
  color: 0xffd49a,
  emissive: 0xff9d49,
  emissiveIntensity: 2.1,
});

function addSakuraTree(scene, x, z, scale = 1) {
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35 * scale, 0.55 * scale, 4.7 * scale, 6),
    sakuraWood,
  );
  trunk.position.set(x, 2.35 * scale, z);
  scene.add(trunk);
  const crownPositions = [
    [0, 4.7, 0],
    [-1.25, 4.2, 0.25],
    [1.15, 4.35, -0.15],
    [0.1, 5.2, 0.8],
  ];
  for (const [offsetX, y, offsetZ] of crownPositions) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7 * scale, 0), pinkCanopy);
    crown.position.set(x + offsetX * scale, y * scale, z + offsetZ * scale);
    scene.add(crown);
  }
}

function addStoneLantern(scene, x, z) {
  const base = new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 1), sakuraStone);
  base.position.set(x, 0.12, z);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.34, 0.85, 6), sakuraStone);
  post.position.set(x, 0.66, z);
  const chamber = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.65, 0.82), sakuraStone);
  chamber.position.set(x, 1.38, z);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.34, 4), sakuraStone);
  roof.position.set(x, 1.87, z);
  roof.rotation.y = Math.PI / 4;
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.32, 0.43), lanternLight);
  glow.position.set(x, 1.39, z);
  scene.add(base, post, chamber, roof, glow);
}

function addPagoda(scene) {
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(11, 0.38, 11),
    sakuraStone,
  );
  platform.position.set(0, 0.13, -20);
  scene.add(platform);
  const templeWalls = new THREE.Mesh(
    new THREE.BoxGeometry(6, 3.6, 6),
    new THREE.MeshStandardMaterial({ color: 0xb77b5d, roughness: 0.88 }),
  );
  templeWalls.position.set(0, 1.8, -20);
  scene.add(templeWalls);
  const doors = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 2.8, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x4c2630, roughness: 0.66 }),
  );
  doors.position.set(0, 1.55, -16.93);
  scene.add(doors);

  for (const [radius, y, height] of [[6.2, 3.95, 0.55], [4.5, 5.05, 0.48], [2.8, 6.05, 0.4]]) {
    const roof = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 0.72, radius, height, 4),
      sakuraRoof,
    );
    roof.position.set(0, y, -20);
    roof.rotation.y = Math.PI / 4;
    scene.add(roof);
  }
  const finial = new THREE.Mesh(
    new THREE.ConeGeometry(0.48, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0xd7a455, metalness: 0.45, roughness: 0.4 }),
  );
  finial.position.set(0, 6.85, -20);
  scene.add(finial);
}

function createSakuraMap(scene, definition) {
  scene.background = new THREE.Color(0x493450);
  scene.fog = new THREE.FogExp2(0x493450, 0.008);
  scene.add(new THREE.AmbientLight(0xffc8d8, 0.85));
  const dusk = new THREE.DirectionalLight(0xffb378, 2.2);
  dusk.position.set(-15, 22, 12);
  scene.add(dusk);
  const skyFill = new THREE.DirectionalLight(0x8bc4ed, 0.65);
  skyFill.position.set(13, 14, -24);
  scene.add(skyFill);

  const named = createNamedColliders(definition.id);
  const mapColliders = named.map(({ box }) => box);
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(definition.size, 0.18, definition.size),
    new THREE.MeshStandardMaterial({ color: 0x554653, roughness: 0.98 }),
  );
  ground.position.y = -0.14;
  scene.add(ground);

  const laneMaterial = new THREE.MeshStandardMaterial({ color: 0x756657, roughness: 0.94 });
  for (const x of [-22, 0, 22]) {
    addBox(scene, [7, 0.07, 96], [x, -0.015, 0], laneMaterial);
  }
  const siteStone = new THREE.MeshStandardMaterial({ color: 0x8c7967, roughness: 0.94 });
  for (const x of [-26, 28]) addBox(scene, [18, 0.08, 24], [x, 0.005, 0], siteStone);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 22),
    new THREE.MeshStandardMaterial({
      color: 0x327f9b,
      emissive: 0x16465d,
      emissiveIntensity: 0.55,
      metalness: 0.18,
      roughness: 0.3,
      transparent: true,
      opacity: 0.88,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, -0.025, 8);
  scene.add(water);
  addBox(scene, [4.4, 0.28, 24], [0, 0.13, 8], sakuraWood);
  const plankGeometry = new THREE.BoxGeometry(4.35, 0.035, 0.16);
  const matrix = new THREE.Matrix4();
  const planks = new THREE.InstancedMesh(plankGeometry, sakuraStone, 19);
  for (let index = 0; index < 19; index += 1) {
    matrix.makeTranslation(0, 0.3, -3 + index * 1.2);
    planks.setMatrixAt(index, matrix);
  }
  planks.instanceMatrix.needsUpdate = true;
  scene.add(planks);

  addPagoda(scene);
  for (const solid of definition.solids) {
    const [x, y, z] = solid.center;
    const material = solid.kind === 'torii-post' || solid.kind === 'torii-beam'
      ? toriiRed
      : solid.kind === 'crate'
        ? crateMaterial
        : solid.kind === 'temple-pillar' || solid.kind === 'fence' || solid.kind === 'wall'
          ? sakuraStone
          : null;
    if (solid.kind === 'tree') {
      addSakuraTree(scene, x, z, solid.name.includes('mid') ? 0.88 : 1);
    } else if (solid.kind === 'lantern') {
      addStoneLantern(scene, x, z);
    } else if (material) {
      addBox(scene, solid.size, solid.center, material, solid.rotationY ?? 0);
    }
  }
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc6e5,
    emissive: 0xff6ea9,
    emissiveIntensity: 1.6,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  for (const x of [-26, 28]) {
    const marker = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.4, 32), markerMaterial);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 0.06, 0);
    scene.add(marker);
  }
  return { colliders: mapColliders, namedColliders: named };
}

export function createMap(scene, mapId = 'shibuya-night') {
  const definition = getMapDefinition(mapId);
  if (definition.id === 'templo-sakura') return createSakuraMap(scene, definition);
  return createShibuyaMap(scene);
}
