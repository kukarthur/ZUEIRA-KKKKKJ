import { applyStalkerAttack, getStalkerAim, mapHasClearance, mapRayDistance } from './crimson-stalker.js';

const MAX_ULTIMATE = 7;
const COOLDOWNS = { teleport: 15_000, gravity: 18_000, repulse: 16_000 };

function clearRayDistance(origin, direction, maxDistance, player) {
  return mapRayDistance(origin, direction, maxDistance, player.map, player.temporaryWalls);
}

export function useSatoroAbility(player, ability, players, now) {
  if (!player.alive) return { ok: false, reason: 'dead' };
  if (ability === 'teleport' || ability === 'gravity' || ability === 'repulse') {
    if (player.satoroCooldowns[ability] > now) return { ok: false, reason: 'cooldown' };
  }

  const direction = getStalkerAim(player.yaw, player.pitch);
  const origin = { x: player.position.x, y: player.y + (player.isCrouching ? 0.92 : 1.62), z: player.position.z };

  if (ability === 'teleport') {
    const distance = clearRayDistance(origin, getStalkerAim(player.yaw, 0), 10, player);
    if (distance < 0.5) return { ok: false, reason: 'blocked' };
    const start = { ...player.position };
    const horizontal = getStalkerAim(player.yaw, 0);
    const steps = Math.ceil(distance / 0.2);
    let travelled = 0;
    for (let step = 1; step <= steps; step += 1) {
      const next = distance * step / steps;
      const x = start.x + horizontal.x * next;
      const z = start.z + horizontal.z * next;
      if (!mapHasClearance(
        x, z, player.y, player.isCrouching ? 1.1 : 1.8, player.map, player.temporaryWalls,
      )) break;
      player.position.x = x;
      player.position.z = z;
      travelled = next;
    }
    if (travelled < 0.5) return { ok: false, reason: 'blocked' };
    player.satoroCooldowns.teleport = now + COOLDOWNS.teleport;
    return { ok: true, ability, teleport: { start, end: { ...player.position }, distance: travelled } };
  }

  if (ability === 'gravity') {
    const distance = clearRayDistance(origin, direction, 12, player);
    const point = {
      x: origin.x + direction.x * distance,
      y: origin.y + direction.y * distance,
      z: origin.z + direction.z * distance,
    };
    player.gravityWells.push({ point, expires: now + 2_000 });
    player.satoroCooldowns.gravity = now + COOLDOWNS.gravity;
    return { ok: true, ability, point, expires: now + 2_000 };
  }

  if (ability === 'repulse') {
    const forward = getStalkerAim(player.yaw, 0);
    const hits = [];
    for (const target of players.values()) {
      if (target.id === player.id || !target.alive || target.team === player.team) continue;
      const dx = target.position.x - player.position.x;
      const dz = target.position.z - player.position.z;
      const along = dx * forward.x + dz * forward.z;
      const across = Math.abs(dx * forward.z - dz * forward.x);
      if (along < 0 || along > 7 || across > 1.8) continue;
      const targetPoint = { x: target.position.x, y: target.y + 1.1, z: target.position.z };
      const dx3 = targetPoint.x - origin.x;
      const dy3 = targetPoint.y - origin.y;
      const dz3 = targetPoint.z - origin.z;
      const distance = Math.hypot(dx3, dy3, dz3);
      if (Math.abs(dy3) > 1.8 || clearRayDistance(origin, {
        x: dx3 / distance,
        y: dy3 / distance,
        z: dz3 / distance,
      }, distance, player) < distance - 0.42) continue;
      target.knockback.x += forward.x * 7;
      target.knockback.z += forward.z * 7;
      hits.push({ targetId: target.id, ...applyStalkerAttack(player, target, 45, now) });
    }
    player.satoroCooldowns.repulse = now + COOLDOWNS.repulse;
    return { ok: true, ability, hits };
  }

  if (ability === 'void') {
    if (player.ultimate < MAX_ULTIMATE) return { ok: false, reason: 'ultimate' };
    if (player.voidChargeUntil) return { ok: false, reason: 'charging' };
    player.ultimate = 0;
    player.voidChargeUntil = now + 1_000;
    player.voidDirection = direction;
    return { ok: true, ability, charging: true, completesAt: player.voidChargeUntil };
  }

  return { ok: false, reason: 'unknown' };
}

export function tickSatoro(player, players, now) {
  player.gravityWells = player.gravityWells.filter((well) => well.expires > now);
  for (const well of player.gravityWells) {
    for (const target of players.values()) {
      if (target.id === player.id || !target.alive || target.team === player.team) continue;
      const dx = well.point.x - target.position.x;
      const dz = well.point.z - target.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 5 || distance < 0.05) continue;
      target.slowedUntil = Math.max(target.slowedUntil, now + 120);
      const pull = Math.min(1.6, distance) * 0.03;
      const nextX = target.position.x + dx / distance * pull;
      const nextZ = target.position.z + dz / distance * pull;
      if (mapHasClearance(
        nextX,
        nextZ,
        target.y,
        target.isCrouching ? 1.1 : 1.8,
        player.map,
        player.temporaryWalls,
      )) {
        target.position.x = nextX;
        target.position.z = nextZ;
      }
      target.aimDisruptedUntil = now + 180;
    }
  }

  if (!player.voidChargeUntil || now < player.voidChargeUntil) return null;
  const origin = { x: player.position.x, y: player.y + 1.2, z: player.position.z };
  const direction = player.voidDirection ?? getStalkerAim(player.yaw, player.pitch);
  const maxRange = mapRayDistance(origin, direction, 100, player.map, player.temporaryWalls);
  const hits = [];
  for (const target of players.values()) {
    if (target.id === player.id || !target.alive || target.team === player.team) continue;
    const dx = target.position.x - origin.x;
    const dy = target.y + 0.9 - origin.y;
    const dz = target.position.z - origin.z;
    const along = dx * direction.x + dy * direction.y + dz * direction.z;
    const acrossSq = dx * dx + dy * dy + dz * dz - along * along;
    if (along < 0 || along > maxRange || acrossSq > 0.85 ** 2) continue;
    hits.push({ targetId: target.id, ...applyStalkerAttack(player, target, 150, now) });
  }
  player.voidChargeUntil = 0;
  player.voidDirection = null;
  return { playerId: player.id, ability: 'void', hits, direction, origin };
}
