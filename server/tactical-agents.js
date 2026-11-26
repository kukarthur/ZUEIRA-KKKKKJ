import {
  applyStalkerAttack,
  damageStalker,
  getStalkerAim,
  mapHasClearance,
  mapRayDistance,
} from './crimson-stalker.js';

const MAX_ULTIMATE = 7;
const BARUTCHO_COOLDOWNS = { sonar: 15_000, flash: 16_000, propel: 18_000 };
const ZORBAO_COOLDOWNS = { wall: 18_000, ice: 16_000, thermal: 20_000 };
const PROPULSION_DISTANCE = 8;
const WALL_HEIGHT = 2.8;
const WALL_HALF_WIDTH = 3;
const WALL_HALF_DEPTH = 0.16;
const ICE_FIELD_RADIUS = 5;
const STORM_RADIUS = 14;

function eyeOrigin(player) {
  return {
    x: player.position.x,
    y: player.y + (player.isCrouching ? 0.92 : 1.62),
    z: player.position.z,
  };
}

function lineIsClear(origin, point, map, walls) {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-4) return true;
  return mapRayDistance(origin, { x: dx / distance, y: dy / distance, z: dz / distance }, distance, map, walls)
    >= distance - 0.42;
}

function getPropelDirection(player) {
  const forward = getStalkerAim(player.yaw, 0);
  const right = { x: -forward.z, z: forward.x };
  let x = 0;
  let z = 0;
  if (player.input.left) {
    x -= right.x;
    z -= right.z;
  }
  if (player.input.right) {
    x += right.x;
    z += right.z;
  }
  if (player.input.forward) {
    x += forward.x;
    z += forward.z;
  }
  if (player.input.backward) {
    x -= forward.x;
    z -= forward.z;
  }
  const length = Math.hypot(x, z);
  return length > 0 ? { x: x / length, z: z / length } : forward;
}

function propel(player) {
  const direction = getPropelDirection(player);
  const start = { ...player.position };
  let distance = 0;
  const steps = PROPULSION_DISTANCE / 0.2;
  for (let index = 1; index <= steps; index += 1) {
    const step = PROPULSION_DISTANCE * index / steps;
    const x = start.x + direction.x * step;
    const z = start.z + direction.z * step;
    if (!mapHasClearance(
      x,
      z,
      player.y,
      player.isCrouching ? 1.1 : 1.8,
      player.map,
      player.temporaryWalls,
    )) break;
    player.position.x = x;
    player.position.z = z;
    distance = step;
  }
  return { start, end: { ...player.position }, direction, distance };
}

function useBarutchoSonar(player, players, now) {
  const revealedTargets = [];
  for (const target of players.values()) {
    if (target.id === player.id || !target.alive || target.team === player.team) continue;
    const dx = target.position.x - player.position.x;
    const dz = target.position.z - player.position.z;
    if (dx * dx + dz * dz > 10 ** 2) continue;
    revealedTargets.push({
      playerId: target.id,
      position: { x: target.position.x, y: target.y, z: target.position.z },
    });
  }
  player.barutchoCooldowns.sonar = now + BARUTCHO_COOLDOWNS.sonar;
  return {
    ok: true,
    ability: 'sonar',
    point: { ...player.position },
    radius: 10,
    durationMs: 3_000,
    revealedTargets,
  };
}

function useBarutchoFlash(player, players, now) {
  const origin = eyeOrigin(player);
  const direction = getStalkerAim(player.yaw, player.pitch);
  const distance = mapRayDistance(origin, direction, 12, player.map, player.temporaryWalls);
  if (distance < 0.75) return { ok: false, reason: 'blocked' };
  const point = {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  };
  const flashedTargets = [];
  for (const target of players.values()) {
    if (target.id === player.id || !target.alive || target.team === player.team) continue;
    const targetEye = eyeOrigin(target);
    const dx = point.x - targetEye.x;
    const dy = point.y - targetEye.y;
    const dz = point.z - targetEye.z;
    const length = Math.hypot(dx, dy, dz);
    if (length > 11 || length < 0.1) continue;
    const look = getStalkerAim(target.yaw, target.pitch);
    const facing = (look.x * dx + look.y * dy + look.z * dz) / length;
    if (facing < 0.78 || !lineIsClear(targetEye, point, target.map, target.temporaryWalls)) continue;
    target.flashedUntil = now + 2_000;
    flashedTargets.push(target.id);
  }
  player.barutchoCooldowns.flash = now + BARUTCHO_COOLDOWNS.flash;
  return {
    ok: true,
    ability: 'flash',
    point,
    durationMs: 2_000,
    flashedTargets,
  };
}

function useBarutchoPropel(player, now) {
  const dash = propel(player);
  if (dash.distance < 0.2) return { ok: false, reason: 'blocked' };
  player.barutchoCooldowns.propel = now + BARUTCHO_COOLDOWNS.propel;
  player.barutchoBoostUntil = now + 3_000;
  return { ok: true, ability: 'propel', dash, boostUntil: player.barutchoBoostUntil };
}

function useBarutchoSonic(player, players, now) {
  if (player.ultimate < MAX_ULTIMATE) return { ok: false, reason: 'ultimate' };
  const origin = eyeOrigin(player);
  const direction = getStalkerAim(player.yaw, player.pitch);
  const distance = mapRayDistance(origin, direction, 18, player.map, player.temporaryWalls);
  const end = {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  };
  const hits = [];
  for (const target of players.values()) {
    if (target.id === player.id || !target.alive || target.team === player.team) continue;
    const center = { x: target.position.x, y: target.y + 1, z: target.position.z };
    const dx = center.x - origin.x;
    const dy = center.y - origin.y;
    const dz = center.z - origin.z;
    const along = dx * direction.x + dy * direction.y + dz * direction.z;
    const acrossSq = dx * dx + dy * dy + dz * dz - along * along;
    if (along < 0 || along > distance || acrossSq > 0.72 ** 2) continue;
    if (!lineIsClear(origin, center, player.map, player.temporaryWalls)) continue;
    const hit = applyStalkerAttack(player, target, 110, now);
    target.knockback.x += direction.x * 8;
    target.knockback.z += direction.z * 8;
    hits.push({ targetId: target.id, ...hit });
  }
  player.ultimate = 0;
  return { ok: true, ability: 'sonic', origin, direction, end, hits };
}

export function useBarutchoAbility(player, ability, players, now) {
  if (!player.alive) return { ok: false, reason: 'dead' };
  if (['sonar', 'flash', 'propel'].includes(ability)) {
    if (player.barutchoCooldowns[ability] > now) return { ok: false, reason: 'cooldown' };
    if (ability === 'sonar') return useBarutchoSonar(player, players, now);
    if (ability === 'flash') return useBarutchoFlash(player, players, now);
    return useBarutchoPropel(player, now);
  }
  if (ability === 'sonic') return useBarutchoSonic(player, players, now);
  return { ok: false, reason: 'unknown' };
}

function getWallPlacement(player, now) {
  const forward = getStalkerAim(player.yaw, 0);
  const position = {
    x: player.position.x + forward.x * 3.5,
    y: 0,
    z: player.position.z + forward.z * 3.5,
  };
  const wall = {
    id: `${player.id}:ice-wall:${now}`,
    ownerId: player.id,
    team: player.team,
    position,
    yaw: player.yaw,
    halfWidth: WALL_HALF_WIDTH,
    halfDepth: WALL_HALF_DEPTH,
    height: WALL_HEIGHT,
    health: 200,
    expiresAt: now + 8_000,
  };
  for (let step = -3; step <= 3; step += 1) {
    const x = position.x + Math.cos(player.yaw) * step;
    const z = position.z + Math.sin(player.yaw) * step;
    if (!mapHasClearance(x, z, 0, WALL_HEIGHT, player.map, player.temporaryWalls)) return null;
  }
  return wall;
}

function useZorbaoWall(player, now) {
  const wall = getWallPlacement(player, now);
  if (!wall) return { ok: false, reason: 'blocked' };
  player.temporaryWalls.push(wall);
  player.zorbaoCooldowns.wall = now + ZORBAO_COOLDOWNS.wall;
  return { ok: true, ability: 'wall', wall };
}

function useZorbaoIce(player, now) {
  const origin = eyeOrigin(player);
  const direction = getStalkerAim(player.yaw, 0);
  const distance = mapRayDistance(origin, direction, 9, player.map, player.temporaryWalls);
  if (distance < 0.75) return { ok: false, reason: 'blocked' };
  const field = {
    id: `${player.id}:ice-field:${now}`,
    ownerId: player.id,
    team: player.team,
    position: {
      x: player.position.x + direction.x * distance,
      y: 0,
      z: player.position.z + direction.z * distance,
    },
    radius: ICE_FIELD_RADIUS,
    expiresAt: now + 6_000,
  };
  player.iceFields.push(field);
  player.zorbaoCooldowns.ice = now + ZORBAO_COOLDOWNS.ice;
  return { ok: true, ability: 'ice', field };
}

function useZorbaoThermal(player, now) {
  player.bonusShieldHealth = Math.max(player.bonusShieldHealth, 40);
  player.bonusShieldUntil = now + 5_000;
  player.zorbaoCooldowns.thermal = now + ZORBAO_COOLDOWNS.thermal;
  return { ok: true, ability: 'thermal', health: player.bonusShieldHealth, expiresAt: player.bonusShieldUntil };
}

function useZorbaoStorm(player, now) {
  if (player.ultimate < MAX_ULTIMATE) return { ok: false, reason: 'ultimate' };
  player.ultimate = 0;
  const storm = {
    id: `${player.id}:storm:${now}`,
    ownerId: player.id,
    team: player.team,
    position: { ...player.position },
    radius: STORM_RADIUS,
    expiresAt: now + 7_000,
    nextDamageAt: now,
  };
  player.storms.push(storm);
  player.zorbaoStormUntil = storm.expiresAt;
  return { ok: true, ability: 'storm', storm };
}

export function useZorbaoAbility(player, ability, players, now) {
  if (!player.alive) return { ok: false, reason: 'dead' };
  if (['wall', 'ice', 'thermal'].includes(ability)) {
    if (player.zorbaoCooldowns[ability] > now) return { ok: false, reason: 'cooldown' };
    if (ability === 'wall') return useZorbaoWall(player, now);
    if (ability === 'ice') return useZorbaoIce(player, now);
    return useZorbaoThermal(player, now);
  }
  if (ability === 'storm') return useZorbaoStorm(player, now);
  return { ok: false, reason: 'unknown' };
}

export function tickTacticalAgents(room, players, now) {
  for (const collection of [room.temporaryWalls, room.iceFields, room.storms]) {
    for (let index = collection.length - 1; index >= 0; index -= 1) {
      if (collection[index].expiresAt <= now) collection.splice(index, 1);
    }
  }

  for (const field of room.iceFields) {
    for (const target of players.values()) {
      if (target.id === field.ownerId || target.team === field.team || !target.alive) continue;
      const dx = target.position.x - field.position.x;
      const dz = target.position.z - field.position.z;
      if (dx * dx + dz * dz <= field.radius ** 2) {
        target.cryoSlowUntil = Math.max(target.cryoSlowUntil, now + 150);
      }
    }
  }

  const stormHits = [];
  for (const storm of room.storms) {
    const owner = players.get(storm.ownerId);
    if (!owner) continue;
    const hits = [];
    for (const target of players.values()) {
      if (target.id === storm.ownerId || target.team === storm.team || !target.alive) continue;
      const dx = target.position.x - storm.position.x;
      const dz = target.position.z - storm.position.z;
      if (dx * dx + dz * dz > storm.radius ** 2) continue;
      target.cryoSlowUntil = Math.max(target.cryoSlowUntil, now + 150);
      if (now < storm.nextDamageAt) continue;
      hits.push({ targetId: target.id, ...damageStalker(target, 15, now, owner.position) });
    }
    if (now >= storm.nextDamageAt) {
      storm.nextDamageAt = now + 1_000;
      if (hits.length) stormHits.push({ owner, hits });
    }
  }
  return stormHits;
}
