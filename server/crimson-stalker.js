import { DEFAULT_MAP_ID, getMapDefinition, getSolidBounds, MAP_DEFINITIONS } from '../src/map-data.js';

export const MAX_HEALTH = 100;
export const MAX_ULTIMATE = 7;
export const SHOT_DAMAGE = 40;
export const SHOT_RANGE = 50;
export const SHOT_INTERVAL_MS = 250;
export const BASE_MOVE_SPEED = 6;
export const REGEN_INTERVAL_MS = 5_000;

export const ABILITY_CONFIG = {
  dash: { cooldown: 14_000, distance: 12 },
  whip: { cooldown: 18_000, range: 10, damage: 45, slowFactor: 0.65, slowDuration: 2_000 },
  shield: { cooldown: 25_000, duration: 2_500, capacity: 150 },
  fury: { duration: 12_000, radius: 4.5, meleeDamage: 90 },
};
export const HIT_REGION_DAMAGE = { head: 120, torso: 40, legs: 25 };

const PLAYER_RADIUS = 0.42;
const TARGET_RADIUS = 0.58;
const REGEN_DELAY = 4_000;
const MAX_REGEN_PER_ROUND = 50;
const SOLIDS_BY_MAP = new Map(Object.entries(MAP_DEFINITIONS).map(([mapId, definition]) => [
  mapId,
  definition.solids.map((solid) => ({ ...solid, bounds: getSolidBounds(solid) })),
]));

export function createStalkerPlayer(
  id,
  index,
  now = Date.now(),
  agent = 'kaneca',
  teamOverride = null,
  mapId = DEFAULT_MAP_ID,
) {
  const team = teamOverride ?? (index % 2 === 0 ? 'attackers' : 'defenders');
  const spawn = getMapDefinition(mapId).spawns[team];
  return {
    id,
    team,
    map: mapId,
    position: { x: spawn.x, z: spawn.z },
    y: 0,
    velocityY: 0,
    knockback: { x: 0, z: 0 },
    grounded: true,
    isCrouching: false,
    jumpQueued: false,
    previousJump: false,
    yaw: spawn.yaw,
    pitch: 0,
    input: { forward: false, backward: false, left: false, right: false, yaw: spawn.yaw, pitch: 0 },
    health: MAX_HEALTH,
    alive: true,
    respawnAt: 0,
    lastShotAt: 0,
    lastDamageAt: now,
    lastRegenAt: now,
    regenerated: 0,
    slowedUntil: 0,
    shieldUntil: 0,
    shieldHealth: 0,
    bonusShieldUntil: 0,
    bonusShieldHealth: 0,
    furyUntil: 0,
    ultimate: 0,
    cooldowns: { dash: 0, whip: 0, shield: 0 },
    agent,
    kills: 0,
    gravityWells: [],
    satoroCooldowns: { teleport: 0, gravity: 0, repulse: 0 },
    barutchoCooldowns: { sonar: 0, flash: 0, propel: 0 },
    barutchoBoostUntil: 0,
    zorbaoCooldowns: { wall: 0, ice: 0, thermal: 0 },
    zorbaoStormUntil: 0,
    cryoSlowUntil: 0,
    temporaryWalls: [],
    voidChargeUntil: 0,
    voidDirection: null,
    aimDisruptedUntil: 0,
  };
}

export function normalizeStalkerInput(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!Number.isFinite(payload.yaw) || !Number.isFinite(payload.pitch)) return null;
  const moveX = Number.isFinite(payload.moveX)
    ? Math.max(-1, Math.min(1, payload.moveX))
    : Number(payload.right === true) - Number(payload.left === true);
  const moveY = Number.isFinite(payload.moveY)
    ? Math.max(-1, Math.min(1, payload.moveY))
    : Number(payload.forward === true) - Number(payload.backward === true);
  return {
    forward: moveY > 0.05,
    backward: moveY < -0.05,
    left: moveX < -0.05,
    right: moveX > 0.05,
    moveX,
    moveY,
    crouch: payload.crouch === true,
    jump: payload.jump === true,
    interact: payload.interact === true,
    yaw: Math.atan2(Math.sin(payload.yaw), Math.cos(payload.yaw)),
    pitch: Math.max(-1.45, Math.min(1.45, payload.pitch)),
  };
}

export function mapHasClearance(
  x,
  z,
  y = 0,
  height = 1.8,
  mapId = DEFAULT_MAP_ID,
  extraSolids = [],
) {
  const solids = SOLIDS_BY_MAP.get(mapId);
  if (!solids) throw new RangeError(`Mapa desconhecido: ${mapId}`);
  return ![...solids, ...extraSolids].some((solid) => {
    if (Number.isFinite(solid.yaw)) {
      if (solid.height <= y || y + height <= 0) return false;
      const dx = x - solid.position.x;
      const dz = z - solid.position.z;
      const rightX = Math.cos(solid.yaw);
      const rightZ = Math.sin(solid.yaw);
      const forwardX = Math.sin(solid.yaw);
      const forwardZ = -Math.cos(solid.yaw);
      const localX = dx * rightX + dz * rightZ;
      const localZ = dx * forwardX + dz * forwardZ;
      const nearestX = Math.max(-solid.halfWidth, Math.min(solid.halfWidth, localX));
      const nearestZ = Math.max(-solid.halfDepth, Math.min(solid.halfDepth, localZ));
      return (localX - nearestX) ** 2 + (localZ - nearestZ) ** 2 < PLAYER_RADIUS ** 2;
    }
    const { bounds } = solid;
    const [minX, minY, minZ] = bounds.min;
    const [maxX, maxY, maxZ] = bounds.max;
    if (maxY <= y || minY >= y + height) return false;
    return x + PLAYER_RADIUS > minX && x - PLAYER_RADIUS < maxX
      && z + PLAYER_RADIUS > minZ && z - PLAYER_RADIUS < maxZ;
  });
}

function isBlocked(x, z, y = 0, height = 1.8, mapId = DEFAULT_MAP_ID, extraSolids = []) {
  return !mapHasClearance(x, z, y, height, mapId, extraSolids);
}

export function moveStalker(player, dt, now) {
  player.isCrouching = player.input.crouch;
  const forwardAxis = player.input.moveY
    ?? Number(player.input.forward) - Number(player.input.backward);
  const strafeAxis = player.input.moveX
    ?? Number(player.input.right) - Number(player.input.left);
  const length = Math.hypot(forwardAxis, strafeAxis);
  const movementScale = Math.min(length, 1);
  const slowScale = now < player.cryoSlowUntil
    ? Math.min(ABILITY_CONFIG.whip.slowFactor, 0.55)
    : now < player.slowedUntil ? ABILITY_CONFIG.whip.slowFactor : 1;
  const crouchScale = player.isCrouching ? 0.6 : 1;
  const furyScale = now < player.furyUntil ? 1.25 : 1;
  const barutchoBoostScale = now < player.barutchoBoostUntil ? 1.2 : 1;
  const distance = BASE_MOVE_SPEED * slowScale * crouchScale * furyScale * barutchoBoostScale * dt;
  const forward = length === 0 ? 0 : forwardAxis / length * movementScale;
  const strafe = length === 0 ? 0 : strafeAxis / length * movementScale;
  const dx = (forward * Math.sin(player.yaw) + strafe * Math.cos(player.yaw)) * distance;
  const dz = (-forward * Math.cos(player.yaw) + strafe * Math.sin(player.yaw)) * distance;
  const moveAxis = (axis, amount) => {
    const steps = Math.max(1, Math.ceil(Math.abs(amount) / 0.12));
    const increment = amount / steps;
    for (let step = 0; step < steps; step++) {
      const position = player.position[axis] + increment;
      const arenaLimit = getMapDefinition(player.map).size / 2 - 3;
      const bounded = Math.max(-arenaLimit, Math.min(arenaLimit, position));
      const blocked = axis === 'x'
        ? isBlocked(bounded, player.position.z, player.y, player.isCrouching ? 1.1 : 1.8, player.map, player.temporaryWalls)
        : isBlocked(player.position.x, bounded, player.y, player.isCrouching ? 1.1 : 1.8, player.map, player.temporaryWalls);
      if (blocked) break;
      player.position[axis] = bounded;
    }
  };
  if (length > 0) {
    moveAxis('x', dx);
    moveAxis('z', dz);
  }
  if (Math.abs(player.knockback.x) + Math.abs(player.knockback.z) > 0.01) {
    moveAxis('x', player.knockback.x * dt);
    moveAxis('z', player.knockback.z * dt);
    player.knockback.x *= Math.max(0, 1 - 5 * dt);
    player.knockback.z *= Math.max(0, 1 - 5 * dt);
  } else {
    player.knockback.x = 0;
    player.knockback.z = 0;
  }

  if (player.input.jump && !player.previousJump) player.jumpQueued = true;
  player.previousJump = player.input.jump;
  const standingHeight = player.isCrouching ? 1.1 : 1.8;
  if (!player.isCrouching && isBlocked(
    player.position.x, player.position.z, player.y, standingHeight, player.map, player.temporaryWalls,
  )) {
    player.isCrouching = true;
  }
  if (player.jumpQueued && player.grounded && !player.isCrouching) {
    player.velocityY = 7.2;
    player.grounded = false;
  }
  player.jumpQueued = false;
  if (!player.grounded) {
    player.velocityY -= 20 * dt;
    const nextY = player.y + player.velocityY * dt;
    if (
      player.velocityY > 0
      && isBlocked(player.position.x, player.position.z, nextY, standingHeight, player.map, player.temporaryWalls)
    ) {
      player.velocityY = 0;
    } else {
      player.y = Math.max(0, nextY);
      if (player.y === 0) {
        player.velocityY = 0;
        player.grounded = true;
      }
    }
  }
}

export function getStalkerAim(yaw, pitch) {
  const horizontal = Math.cos(pitch);
  return { x: Math.sin(yaw) * horizontal, y: Math.sin(pitch), z: -Math.cos(yaw) * horizontal };
}

function rayBoxDistance(origin, direction, bounds, maxDistance) {
  let near = 0;
  let far = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const coordinate = ['x', 'y', 'z'][axis];
    if (Math.abs(direction[coordinate]) < 1e-8) {
      if (origin[coordinate] < bounds.min[axis] || origin[coordinate] > bounds.max[axis]) return null;
      continue;
    }
    const first = (bounds.min[axis] - origin[coordinate]) / direction[coordinate];
    const second = (bounds.max[axis] - origin[coordinate]) / direction[coordinate];
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) return null;
  }
  return far >= 0 && near <= maxDistance ? near : null;
}

function rayWallDistance(origin, direction, wall, maxDistance) {
  const cos = Math.cos(wall.yaw);
  const sin = Math.sin(wall.yaw);
  const dx = origin.x - wall.position.x;
  const dz = origin.z - wall.position.z;
  const localOrigin = {
    x: dx * cos + dz * sin,
    y: origin.y,
    z: dx * sin - dz * cos,
  };
  const localDirection = {
    x: direction.x * cos + direction.z * sin,
    y: direction.y,
    z: direction.x * sin - direction.z * cos,
  };
  return rayBoxDistance(localOrigin, localDirection, {
    min: [-wall.halfWidth, 0, -wall.halfDepth],
    max: [wall.halfWidth, wall.height, wall.halfDepth],
  }, maxDistance);
}

function findTemporaryWallHit(origin, direction, limit, walls = []) {
  let closest = null;
  for (const wall of walls) {
    const distance = rayWallDistance(origin, direction, wall, limit);
    if (distance === null || (closest && distance >= closest.distance)) continue;
    closest = { wall, distance };
  }
  return closest;
}

export function mapRayDistance(origin, direction, limit, mapId = DEFAULT_MAP_ID, extraSolids = []) {
  const solids = SOLIDS_BY_MAP.get(mapId);
  if (!solids) throw new RangeError(`Mapa desconhecido: ${mapId}`);
  let nearest = limit;
  for (const solid of solids) {
    const distance = rayBoxDistance(origin, direction, solid.bounds, nearest);
    if (distance !== null) nearest = distance;
  }
  for (const solid of extraSolids) {
    const distance = Number.isFinite(solid.yaw)
      ? rayWallDistance(origin, direction, solid, nearest)
      : rayBoxDistance(origin, direction, solid.bounds, nearest);
    if (distance !== null) nearest = distance;
  }
  return nearest;
}

function raySphereDistance(origin, direction, center, radius, maxDistance) {
  const x = center.x - origin.x;
  const y = center.y - origin.y;
  const z = center.z - origin.z;
  const projection = x * direction.x + y * direction.y + z * direction.z;
  if (projection < 0 || projection > maxDistance) return null;
  const perpendicular = x * x + y * y + z * z - projection * projection;
  if (perpendicular > radius * radius) return null;
  const distance = projection - Math.sqrt(radius * radius - perpendicular);
  return distance >= 0 ? distance : null;
}

function eyePosition(player, height = 1.62) {
  return { x: player.position.x, y: player.y + height, z: player.position.z };
}

export function findStalkerShotTarget(shooter, players, direction, range = SHOT_RANGE) {
  const origin = eyePosition(shooter, shooter.isCrouching ? 0.92 : 1.62);
  const wallDistance = mapRayDistance(origin, direction, range, shooter.map, shooter.temporaryWalls);
  let closest = null;
  for (const target of players.values()) {
    if (target.id === shooter.id || !target.alive || target.team === shooter.team) continue;
    const height = target.isCrouching ? 1.1 : 1.8;
    const legsTop = height * 0.36;
    const torsoTop = height * 0.79;
    const regions = [
      { name: 'head', minY: torsoTop, maxY: height },
      { name: 'torso', minY: legsTop, maxY: torsoTop },
      { name: 'legs', minY: 0, maxY: legsTop },
    ];
    for (const region of regions) {
      const bounds = {
        min: [
          target.position.x - TARGET_RADIUS,
          target.y + region.minY,
          target.position.z - TARGET_RADIUS,
        ],
        max: [
          target.position.x + TARGET_RADIUS,
          target.y + region.maxY,
          target.position.z + TARGET_RADIUS,
        ],
      };
      const distance = rayBoxDistance(origin, direction, bounds, wallDistance);
      if (distance === null || (closest && distance >= closest.distance)) continue;
      closest = {
        target,
        region: region.name,
        distance,
        point: {
          x: origin.x + direction.x * distance,
          y: origin.y + direction.y * distance,
          z: origin.z + direction.z * distance,
        },
      };
    }
  }
  return closest;
}

export function resolveStalkerShot(shooter, players, now, shotId) {
  const fireInterval = now < shooter.furyUntil ? SHOT_INTERVAL_MS / 1.2 : SHOT_INTERVAL_MS;
  if (!shooter.alive) return { ok: false, reason: 'dead' };
  if (now < shooter.shieldUntil && shooter.shieldHealth > 0) return { ok: false, reason: 'shield' };
  if (now - shooter.lastShotAt < fireInterval) return { ok: false, reason: 'cooldown' };

  shooter.lastShotAt = now;
  const direction = getStalkerAim(shooter.yaw, shooter.pitch);
  const origin = eyePosition(shooter, shooter.isCrouching ? 0.92 : 1.62);
  const staticDistance = mapRayDistance(origin, direction, SHOT_RANGE, shooter.map);
  const wallHit = findTemporaryWallHit(origin, direction, staticDistance, shooter.temporaryWalls);
  const wallDistance = wallHit?.distance ?? staticDistance;
  const hit = findStalkerShotTarget(shooter, players, direction);
  const wallIsHit = wallHit && (!hit || wallHit.distance <= hit.distance);
  let hitPoint = hit?.point ?? {
    x: origin.x + direction.x * wallDistance,
    y: origin.y + direction.y * wallDistance,
    z: origin.z + direction.z * wallDistance,
  };
  let damage = null;
  let shotWallHit = null;

  if (wallIsHit) {
    hitPoint = {
      x: origin.x + direction.x * wallHit.distance,
      y: origin.y + direction.y * wallHit.distance,
      z: origin.z + direction.z * wallHit.distance,
    };
    wallHit.wall.health = Math.max(0, wallHit.wall.health - SHOT_DAMAGE);
    const destroyed = wallHit.wall.health === 0;
    shotWallHit = { id: wallHit.wall.id, health: wallHit.wall.health, destroyed };
    if (destroyed) {
      const wallIndex = shooter.temporaryWalls.indexOf(wallHit.wall);
      if (wallIndex >= 0) shooter.temporaryWalls.splice(wallIndex, 1);
    }
  } else if (hit) {
    damage = applyAttack(shooter, hit.target, HIT_REGION_DAMAGE[hit.region], now);
  }

  return {
    ok: true,
    shot: {
      shooterId: shooter.id,
      shotId,
      from: origin,
      direction,
      hitPoint,
    },
    wallHit: shotWallHit,
    damage: damage ? {
      targetId: hit.target.id,
      region: hit.region,
      isHeadshot: hit.region === 'head',
      ...damage,
    } : null,
  };
}

function hasLineOfSight(origin, target, mapId = DEFAULT_MAP_ID, extraSolids = []) {
  const destination = {
    x: target.position.x,
    y: target.y + (target.isCrouching ? 0.55 : 1.1),
    z: target.position.z,
  };
  const dx = destination.x - origin.x;
  const dy = destination.y - origin.y;
  const dz = destination.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance === 0) return true;
  const direction = { x: dx / distance, y: dy / distance, z: dz / distance };
  return mapRayDistance(origin, direction, distance, mapId, extraSolids) >= distance - TARGET_RADIUS;
}

function isShieldFacing(shielded, source) {
  const forward = getStalkerAim(shielded.yaw, 0);
  const dx = source.x - shielded.position.x;
  const dz = source.z - shielded.position.z;
  const distance = Math.hypot(dx, dz);
  return distance === 0 || (forward.x * dx + forward.z * dz) / distance >= 0.35;
}

export function damageStalker(target, amount, now, source) {
  if (!target.alive || amount <= 0) return { damage: 0, shieldDamage: 0, killed: false };
  let remaining = amount;
  let shieldDamage = 0;
  if (now < target.shieldUntil && target.shieldHealth > 0 && isShieldFacing(target, source)) {
    shieldDamage = Math.min(target.shieldHealth, remaining);
    target.shieldHealth -= shieldDamage;
    remaining -= shieldDamage;
    if (target.shieldHealth === 0) target.shieldUntil = 0;
  }
  if (now < target.bonusShieldUntil && target.bonusShieldHealth > 0 && remaining > 0) {
    const absorbed = Math.min(target.bonusShieldHealth, remaining);
    target.bonusShieldHealth -= absorbed;
    shieldDamage += absorbed;
    remaining -= absorbed;
    if (target.bonusShieldHealth === 0) target.bonusShieldUntil = 0;
  }
  const damage = Math.min(target.health, remaining);
  target.health -= damage;
  if (damage > 0 || shieldDamage > 0) target.lastDamageAt = now;
  const killed = target.health === 0;
  if (killed) target.alive = false;
  return { damage, shieldDamage, killed };
}

function rewardUltimate(attacker, hit) {
  if (hit.damage > 0) attacker.ultimate = Math.min(MAX_ULTIMATE, attacker.ultimate + 1 + Number(hit.killed));
}

function applyAttack(attacker, target, amount, now) {
  const hit = damageStalker(target, amount, now, attacker.position);
  rewardUltimate(attacker, hit);
  return {
    targetId: target.id,
    damage: hit.damage,
    shieldDamage: hit.shieldDamage,
    killed: hit.killed,
  };
}

export function applyStalkerAttack(attacker, target, amount, now) {
  return applyAttack(attacker, target, amount, now);
}

function dashStalker(player) {
  const direction = getStalkerAim(player.yaw, 0);
  const start = { ...player.position };
  let distance = 0;
  for (let step = 0.25; step <= ABILITY_CONFIG.dash.distance; step += 0.25) {
    const next = Math.min(step, ABILITY_CONFIG.dash.distance);
    const x = start.x + direction.x * next;
    const z = start.z + direction.z * next;
    if (isBlocked(x, z, player.y, player.isCrouching ? 1.1 : 1.8, player.map, player.temporaryWalls)) break;
    player.position.x = x;
    player.position.z = z;
    distance = next;
  }
  return { start, end: { ...player.position }, distance };
}

function useWhip(player, players, now) {
  const direction = getStalkerAim(player.yaw, player.pitch);
  const origin = eyePosition(player, player.isCrouching ? 0.72 : 1.25);
  const maxRange = mapRayDistance(origin, direction, ABILITY_CONFIG.whip.range, player.map, player.temporaryWalls);
  let targetHit = null;
  for (const target of players.values()) {
    if (target.id === player.id || !target.alive || target.team === player.team) continue;
    const distance = raySphereDistance(
      origin,
      direction,
      { x: target.position.x, y: target.y + (target.isCrouching ? 0.55 : 1.1), z: target.position.z },
      TARGET_RADIUS,
      maxRange,
    );
    if (distance === null || !hasLineOfSight(origin, target, player.map, player.temporaryWalls)) continue;
    if (!targetHit || distance < targetHit.distance) targetHit = { target, distance };
  }
  if (!targetHit) return [];
  const hit = applyAttack(player, targetHit.target, ABILITY_CONFIG.whip.damage, now);
  if (hit.damage > 0 && !hit.killed) {
    targetHit.target.slowedUntil = now + ABILITY_CONFIG.whip.slowDuration;
  }
  return [hit];
}

function useFuryMelee(player, players, now) {
  const hits = [];
  for (const target of players.values()) {
    if (target.id === player.id || !target.alive || target.team === player.team) continue;
    const dx = target.position.x - player.position.x;
    const dz = target.position.z - player.position.z;
    if (dx * dx + dz * dz + (target.y - player.y) ** 2 > ABILITY_CONFIG.fury.radius ** 2) continue;
    if (!hasLineOfSight(eyePosition(player), target, player.map, player.temporaryWalls)) continue;
    hits.push(applyAttack(player, target, ABILITY_CONFIG.fury.meleeDamage, now));
  }
  return hits;
}

export function useStalkerAbility(player, ability, players, now) {
  if (!player.alive) return { ok: false, reason: 'dead' };
  if (ability === 'dash' || ability === 'whip' || ability === 'shield') {
    if (player.cooldowns[ability] > now) return { ok: false, reason: 'cooldown' };
  }

  if (ability === 'dash') {
    const dash = dashStalker(player);
    if (dash.distance === 0) return { ok: false, reason: 'blocked' };
    player.cooldowns.dash = now + ABILITY_CONFIG.dash.cooldown;
    return { ok: true, ability, dash };
  }
  if (ability === 'whip') {
    player.cooldowns.whip = now + ABILITY_CONFIG.whip.cooldown;
    const fury = now < player.furyUntil;
    return {
      ok: true,
      ability,
      fury,
      hits: fury ? useFuryMelee(player, players, now) : useWhip(player, players, now),
    };
  }
  if (ability === 'shield') {
    player.cooldowns.shield = now + ABILITY_CONFIG.shield.cooldown;
    player.shieldUntil = now + ABILITY_CONFIG.shield.duration;
    player.shieldHealth = ABILITY_CONFIG.shield.capacity;
    return { ok: true, ability };
  }
  if (ability === 'fury') {
    if (now < player.furyUntil) return { ok: false, reason: 'active' };
    if (player.ultimate < MAX_ULTIMATE) return { ok: false, reason: 'ultimate' };
    player.furyUntil = now + ABILITY_CONFIG.fury.duration;
    player.ultimate = 0;
    return { ok: true, ability };
  }
  return { ok: false, reason: 'unknown' };
}

export function tickStalker(player, dt, now) {
  if (!player.alive) return;
  if (now >= player.shieldUntil) player.shieldHealth = 0;
  if (now >= player.bonusShieldUntil) player.bonusShieldHealth = 0;
  if (player.furyUntil && now >= player.furyUntil) player.furyUntil = 0;
  if (now - player.lastDamageAt < REGEN_DELAY || player.regenerated >= MAX_REGEN_PER_ROUND) return 0;
  if (now - Math.max(player.lastDamageAt, player.lastRegenAt) < REGEN_INTERVAL_MS) return 0;
  if (player.health >= MAX_HEALTH) {
    player.lastRegenAt = now;
    return 0;
  }

  player.health += 1;
  player.regenerated += 1;
  player.lastRegenAt = now;
  return 1;
}

export function formatStalkerHealth(health) {
  return Math.ceil(health);
}

export function serializeStalker(player, now) {
  const cooldowns = player.agent === 'satoro'
    ? {
      teleport: Math.max(0, player.satoroCooldowns.teleport - now),
      gravity: Math.max(0, player.satoroCooldowns.gravity - now),
      repulse: Math.max(0, player.satoroCooldowns.repulse - now),
      void: 0,
    }
    : player.agent === 'barutcho'
      ? {
        sonar: Math.max(0, player.barutchoCooldowns.sonar - now),
        flash: Math.max(0, player.barutchoCooldowns.flash - now),
        propel: Math.max(0, player.barutchoCooldowns.propel - now),
        sonic: 0,
      }
      : player.agent === 'zorbao'
        ? {
          wall: Math.max(0, player.zorbaoCooldowns.wall - now),
          ice: Math.max(0, player.zorbaoCooldowns.ice - now),
          thermal: Math.max(0, player.zorbaoCooldowns.thermal - now),
          storm: 0,
        }
        : {
      dash: Math.max(0, player.cooldowns.dash - now),
      whip: Math.max(0, player.cooldowns.whip - now),
      shield: Math.max(0, player.cooldowns.shield - now),
      fury: 0,
        };
  return {
    id: player.id,
    team: player.team,
    position: player.position,
    y: player.y,
    isCrouching: player.isCrouching,
    agent: player.agent,
    yaw: player.yaw,
    health: player.health,
    alive: player.alive,
    ultimate: player.ultimate,
    kills: player.kills,
    aimDisrupted: now < player.aimDisruptedUntil,
    fury: now < player.furyUntil,
    barutchoBoost: now < player.barutchoBoostUntil,
    zorbaoStorm: now < player.zorbaoStormUntil,
    shield: {
      active: now < player.shieldUntil && player.shieldHealth > 0,
      health: player.shieldHealth,
      remaining: Math.max(0, player.shieldUntil - now),
    },
    bonusShield: {
      active: now < player.bonusShieldUntil && player.bonusShieldHealth > 0,
      health: player.bonusShieldHealth,
      remaining: Math.max(0, player.bonusShieldUntil - now),
    },
    slowed: now < player.slowedUntil,
    cooldowns,
  };
}
