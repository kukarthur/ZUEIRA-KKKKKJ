export const ARENA_LIMIT = 18;
export const MOVE_SPEED = 6;
export const PLAYER_HEALTH = 100;
export const SHOT_DAMAGE = 34;
export const SHOT_INTERVAL_MS = 250;
export const SHOT_RANGE = 50;

const PITCH_LIMIT = 1.45;
const TARGET_RADIUS = 0.55;

export function normalizeInput(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!Number.isFinite(payload.yaw) || !Number.isFinite(payload.pitch)) return null;

  return {
    forward: payload.forward === true,
    backward: payload.backward === true,
    left: payload.left === true,
    right: payload.right === true,
    yaw: Math.atan2(Math.sin(payload.yaw), Math.cos(payload.yaw)),
    pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, payload.pitch)),
  };
}

export function movePlayer(player, dt) {
  const { forward, backward, left, right, yaw } = player.input;
  const forwardAxis = Number(forward) - Number(backward);
  const strafeAxis = Number(right) - Number(left);
  const length = Math.hypot(forwardAxis, strafeAxis);
  if (length === 0) return;

  const forwardAmount = forwardAxis / length;
  const strafeAmount = strafeAxis / length;
  player.position.x += (forwardAmount * Math.sin(yaw) + strafeAmount * Math.cos(yaw)) * MOVE_SPEED * dt;
  player.position.z += (-forwardAmount * Math.cos(yaw) + strafeAmount * Math.sin(yaw)) * MOVE_SPEED * dt;
  player.position.x = Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, player.position.x));
  player.position.z = Math.max(-ARENA_LIMIT, Math.min(ARENA_LIMIT, player.position.z));
}

export function getAimDirection(yaw, pitch) {
  const horizontal = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * horizontal,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * horizontal,
  };
}

export function findShotTarget(shooter, players, direction) {
  const origin = { x: shooter.position.x, y: 1.62, z: shooter.position.z };
  let closest = null;

  for (const target of players.values()) {
    if (target.id === shooter.id || !target.alive) continue;

    const center = { x: target.position.x, y: 1.1, z: target.position.z };
    const toCenter = {
      x: center.x - origin.x,
      y: center.y - origin.y,
      z: center.z - origin.z,
    };
    const projection = toCenter.x * direction.x + toCenter.y * direction.y + toCenter.z * direction.z;
    if (projection < 0 || projection > SHOT_RANGE) continue;

    const distanceSquared = toCenter.x ** 2 + toCenter.y ** 2 + toCenter.z ** 2 - projection ** 2;
    if (distanceSquared > TARGET_RADIUS ** 2) continue;

    const distance = projection - Math.sqrt(TARGET_RADIUS ** 2 - distanceSquared);
    if (distance < 0 || (closest && distance >= closest.distance)) continue;
    closest = {
      target,
      distance,
      point: {
        x: origin.x + direction.x * distance,
        y: origin.y + direction.y * distance,
        z: origin.z + direction.z * distance,
      },
    };
  }

  return closest;
}
