export const MAP_SIZE = 104;
export const MAP_HALF_SIZE = MAP_SIZE / 2;
export const DEFAULT_MAP_ID = 'shibuya-night';

const boundarySolids = [
  { name: 'north-boundary', kind: 'wall', center: [0, 4, -52], size: [104, 8, 2] },
  { name: 'south-boundary', kind: 'wall', center: [0, 4, 52], size: [104, 8, 2] },
  { name: 'west-boundary', kind: 'wall', center: [-52, 4, 0], size: [2, 8, 104] },
  { name: 'east-boundary', kind: 'wall', center: [52, 4, 0], size: [2, 8, 104] },
];

const shibuyaSolids = [
  ...boundarySolids,
  { name: 'west-building-north', kind: 'building', center: [-43, 9, -37], size: [17, 18, 24] },
  { name: 'west-building-south', kind: 'building', center: [-43, 8, 37], size: [17, 16, 24] },
  { name: 'east-building-north', kind: 'building', center: [43, 10, -37], size: [17, 20, 24] },
  { name: 'east-building-south', kind: 'building', center: [43, 8, 37], size: [17, 16, 24] },
  { name: 'west-shop-inner-north', kind: 'building', center: [-35, 5, -17], size: [9, 10, 10] },
  { name: 'west-shop-inner-south', kind: 'building', center: [-35, 5, 17], size: [9, 10, 10] },
  { name: 'east-shop-inner-north', kind: 'building', center: [35, 6, -17], size: [9, 12, 10] },
  { name: 'east-shop-inner-south', kind: 'building', center: [35, 6, 17], size: [9, 12, 10] },
  { name: 'mid-car-1', kind: 'car', center: [-5.8, 1, -21], size: [4.4, 1.9, 2.1], rotationY: -0.2 },
  { name: 'mid-car-2', kind: 'car', center: [5.4, 1, -9], size: [4.4, 1.9, 2.1], rotationY: 0.28 },
  { name: 'mid-car-3', kind: 'car', center: [-5.2, 1, 10], size: [4.4, 1.9, 2.1], rotationY: 0.14 },
  { name: 'mid-car-4', kind: 'car', center: [5.8, 1, 24], size: [4.4, 1.9, 2.1], rotationY: -0.24 },
  { name: 'site-a-kiosk', kind: 'kiosk', center: [-26, 1.6, 0], size: [4.2, 3.2, 4.2] },
  { name: 'site-a-crate-1', kind: 'crate', center: [-31, 0.8, -9], size: [2.4, 1.6, 2.4] },
  { name: 'site-a-crate-2', kind: 'crate', center: [-20, 0.8, 8], size: [2.4, 1.6, 2.4], rotationY: 0.32 },
  { name: 'site-a-crate-3', kind: 'crate', center: [-32, 0.65, 9], size: [1.8, 1.3, 1.8] },
  { name: 'site-b-crate-1', kind: 'crate', center: [19, 0.8, -8], size: [2.4, 1.6, 2.4] },
  { name: 'site-b-crate-2', kind: 'crate', center: [32, 0.8, 8], size: [2.4, 1.6, 2.4], rotationY: -0.24 },
  { name: 'site-b-crate-3', kind: 'crate', center: [20, 0.65, 9], size: [1.8, 1.3, 1.8] },
  { name: 'site-b-alley-north', kind: 'alley-wall', center: [24, 2.2, -7.6], size: [16, 4.4, 0.8] },
  { name: 'site-b-alley-south', kind: 'alley-wall', center: [24, 2.2, 7.6], size: [16, 4.4, 0.8] },
  { name: 'site-b-platform', kind: 'platform', center: [28, 0.12, 0], size: [8, 0.24, 8] },
  { name: 'site-b-ramp', kind: 'ramp', center: [22.8, 0.1, 0], size: [3.2, 0.18, 5] },
];

const templeSolids = [
  ...boundarySolids,
  { name: 'temple-core', kind: 'temple', center: [0, 1.8, -20], size: [6, 3.6, 6] },
  { name: 'temple-pillar-nw', kind: 'temple-pillar', center: [-4.3, 1.8, -24.3], size: [0.8, 3.6, 0.8] },
  { name: 'temple-pillar-ne', kind: 'temple-pillar', center: [4.3, 1.8, -24.3], size: [0.8, 3.6, 0.8] },
  { name: 'temple-pillar-sw', kind: 'temple-pillar', center: [-4.3, 1.8, -15.7], size: [0.8, 3.6, 0.8] },
  { name: 'temple-pillar-se', kind: 'temple-pillar', center: [4.3, 1.8, -15.7], size: [0.8, 3.6, 0.8] },
  { name: 'temple-fence-west', kind: 'fence', center: [-9, 0.9, -20], size: [0.45, 1.8, 15] },
  { name: 'temple-fence-east', kind: 'fence', center: [9, 0.9, -20], size: [0.45, 1.8, 15] },
  { name: 'tree-west-north', kind: 'tree', center: [-38, 2.5, -34], size: [1, 5, 1] },
  { name: 'tree-west-mid-north', kind: 'tree', center: [-38, 2.5, -17], size: [1, 5, 1] },
  { name: 'tree-west-mid-south', kind: 'tree', center: [-38, 2.5, 17], size: [1, 5, 1] },
  { name: 'tree-west-south', kind: 'tree', center: [-38, 2.5, 34], size: [1, 5, 1] },
  { name: 'tree-east-north', kind: 'tree', center: [38, 2.5, -34], size: [1, 5, 1] },
  { name: 'tree-east-mid-north', kind: 'tree', center: [38, 2.5, -17], size: [1, 5, 1] },
  { name: 'tree-east-mid-south', kind: 'tree', center: [38, 2.5, 17], size: [1, 5, 1] },
  { name: 'tree-east-south', kind: 'tree', center: [38, 2.5, 34], size: [1, 5, 1] },
  { name: 'torii-a-post-west', kind: 'torii-post', center: [-28.7, 2.3, 0], size: [0.55, 4.6, 0.55] },
  { name: 'torii-a-post-east', kind: 'torii-post', center: [-23.3, 2.3, 0], size: [0.55, 4.6, 0.55] },
  { name: 'torii-a-beam-main', kind: 'torii-beam', center: [-26, 5.15, 0], size: [7.2, 0.55, 0.65] },
  { name: 'torii-a-beam-lower', kind: 'torii-beam', center: [-26, 4.25, 0], size: [5.8, 0.3, 0.45] },
  { name: 'torii-b-post-west', kind: 'torii-post', center: [25.3, 2.3, 0], size: [0.55, 4.6, 0.55] },
  { name: 'torii-b-post-east', kind: 'torii-post', center: [30.7, 2.3, 0], size: [0.55, 4.6, 0.55] },
  { name: 'torii-b-beam-main', kind: 'torii-beam', center: [28, 5.15, 0], size: [7.2, 0.55, 0.65] },
  { name: 'torii-b-beam-lower', kind: 'torii-beam', center: [28, 4.25, 0], size: [5.8, 0.3, 0.45] },
  { name: 'lantern-a-west', kind: 'lantern', center: [-34, 0.9, -7], size: [0.8, 1.8, 0.8] },
  { name: 'lantern-a-east', kind: 'lantern', center: [-18, 0.9, 7], size: [0.8, 1.8, 0.8] },
  { name: 'lantern-b-west', kind: 'lantern', center: [20, 0.9, -7], size: [0.8, 1.8, 0.8] },
  { name: 'lantern-b-east', kind: 'lantern', center: [36, 0.9, 7], size: [0.8, 1.8, 0.8] },
  { name: 'site-a-cover-west', kind: 'crate', center: [-32, 0.9, 9], size: [2.4, 1.8, 2.4] },
  { name: 'site-a-cover-east', kind: 'crate', center: [-20, 0.9, -9], size: [2.4, 1.8, 2.4] },
  { name: 'site-b-cover-west', kind: 'crate', center: [20, 0.9, 9], size: [2.4, 1.8, 2.4] },
  { name: 'site-b-cover-east', kind: 'crate', center: [34, 0.9, -9], size: [2.4, 1.8, 2.4] },
  { name: 'mid-cover-west', kind: 'crate', center: [-15, 0.8, -7], size: [2.2, 1.6, 2.2] },
  { name: 'mid-cover-east', kind: 'crate', center: [15, 0.8, 11], size: [2.2, 1.6, 2.2] },
];

export const SPAWNS = {
  attackers: { x: 0, z: 44, yaw: 0 },
  defenders: { x: 0, z: -44, yaw: Math.PI },
};

const mapSites = { A: { x: -26, z: 0 }, B: { x: 28, z: 0 } };

export const MAP_DEFINITIONS = {
  'shibuya-night': {
    id: 'shibuya-night',
    name: 'Shibuya Night',
    size: MAP_SIZE,
    solids: shibuyaSolids,
    spawns: SPAWNS,
    sites: mapSites,
  },
  'templo-sakura': {
    id: 'templo-sakura',
    name: 'Templo Sakura',
    size: MAP_SIZE,
    solids: templeSolids,
    spawns: SPAWNS,
    sites: mapSites,
  },
};

export const MAP_SOLIDS = MAP_DEFINITIONS[DEFAULT_MAP_ID].solids;

export function getMapDefinition(mapId = DEFAULT_MAP_ID) {
  const definition = MAP_DEFINITIONS[mapId];
  if (!definition) throw new RangeError(`Mapa desconhecido: ${mapId}`);
  return definition;
}

export function getSolidBounds(solid) {
  const [x, y, z] = solid.center;
  const [width, height, depth] = solid.size;
  const angle = solid.rotationY ?? 0;
  const halfWidth = (Math.abs(width * Math.cos(angle)) + Math.abs(depth * Math.sin(angle))) / 2;
  const halfDepth = (Math.abs(width * Math.sin(angle)) + Math.abs(depth * Math.cos(angle))) / 2;

  return {
    min: [x - halfWidth, y - height / 2, z - halfDepth],
    max: [x + halfWidth, y + height / 2, z + halfDepth],
  };
}
