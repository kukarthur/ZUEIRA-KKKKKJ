import { getMapDefinition } from '../src/map-data.js';

export const PLANT_DURATION_MS = 3_000;
export const DEFUSE_DURATION_MS = 4_000;
export const DETONATION_DURATION_MS = 35_000;
export const SPIKE_PICKUP_RADIUS = 2.2;
export const SPIKE_DEFUSE_RADIUS = 2.8;
export const SPIKE_SITE_RADIUS = 9;
export const SPIKE_SITES = {
  A: { x: -26, z: 0 },
  B: { x: 28, z: 0 },
};

export function createSpikeState() {
  return {
    phase: 'carried',
    carrierId: null,
    plantingId: null,
    defuserId: null,
    position: null,
    site: null,
    plantProgressMs: 0,
    defuseProgressMs: 0,
    detonateAt: 0,
    winner: null,
    result: null,
  };
}

export function assignSpikeCarrier(room, random = Math.random) {
  const attackers = [...room.members.values()].filter(({ team }) => team === 'attackers');
  if (attackers.length === 0) return null;
  const index = Math.min(attackers.length - 1, Math.floor(random() * attackers.length));
  const carrier = attackers[index];
  room.spike = createSpikeState();
  room.spike.carrierId = carrier.id;
  return carrier.id;
}

function distanceXZ(position, target) {
  return Math.hypot(position.x - target.x, position.z - target.z);
}

function nearestSite(position, mapId) {
  const site = Object.entries(getMapDefinition(mapId).sites)
    .map(([name, center]) => ({ name, center, distance: distanceXZ(position, center) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return site.distance <= SPIKE_SITE_RADIUS ? site.name : null;
}

function positionOf(player) {
  return { x: player.position.x, y: player.y, z: player.position.z };
}

export function serializeSpike(room, players, now = Date.now()) {
  const spike = room.spike;
  if (!spike) return null;
  const carrier = spike.carrierId ? room.members.get(spike.carrierId) : null;
  return {
    phase: spike.phase,
    carrierId: spike.carrierId,
    carrierNickname: carrier?.nickname ?? null,
    position: spike.position ? { ...spike.position } : null,
    site: spike.site,
    plantProgressMs: spike.plantProgressMs,
    defuseProgressMs: spike.defuseProgressMs,
    detonateAt: spike.detonateAt,
    remainingMs: spike.phase === 'planted' ? Math.max(0, spike.detonateAt - now) : 0,
    winner: spike.winner,
    result: spike.result,
  };
}

export function tickSpike(room, players, dt, now) {
  const spike = room.spike;
  if (!spike || spike.phase === 'resolved') return null;
  const durationMs = dt * 1000;

  if (spike.phase === 'carried') {
    const carrier = players.get(spike.carrierId);
    if (!carrier?.alive) {
      if (carrier) spike.position = positionOf(carrier);
      spike.carrierId = null;
      spike.phase = 'dropped';
      spike.plantProgressMs = 0;
    } else {
      const site = nearestSite(carrier.position, room.map);
      if (carrier.input.interact && site) {
        spike.plantingId = carrier.id;
        spike.plantProgressMs += durationMs;
        if (spike.plantProgressMs >= PLANT_DURATION_MS) {
          spike.phase = 'planted';
          spike.site = site;
          spike.position = positionOf(carrier);
          spike.detonateAt = now + DETONATION_DURATION_MS;
          spike.carrierId = null;
          spike.plantingId = null;
          spike.plantProgressMs = PLANT_DURATION_MS;
        }
      } else {
        spike.plantProgressMs = 0;
        spike.plantingId = null;
      }
    }
  }

  if (spike.phase === 'dropped' && spike.position) {
    const pickup = [...players.values()].find((player) => (
      player.team === 'attackers'
      && player.alive
      && player.input.interact
      && distanceXZ(player.position, spike.position) <= SPIKE_PICKUP_RADIUS
    ));
    if (pickup) {
      spike.phase = 'carried';
      spike.carrierId = pickup.id;
      spike.position = null;
    }
  }

  if (spike.phase === 'planted') {
    const defuser = [...players.values()].find((player) => (
      player.team === 'defenders'
      && player.alive
      && player.input.interact
      && distanceXZ(player.position, spike.position) <= SPIKE_DEFUSE_RADIUS
    ));
    if (defuser) {
      spike.defuserId = defuser.id;
      spike.defuseProgressMs += durationMs;
      if (spike.defuseProgressMs >= DEFUSE_DURATION_MS) {
        spike.phase = 'resolved';
        spike.winner = 'defenders';
        spike.result = 'defused';
        return { winner: 'defenders', result: 'defused' };
      }
    } else {
      spike.defuseProgressMs = 0;
      spike.defuserId = null;
    }
    if (now >= spike.detonateAt) {
      spike.phase = 'resolved';
      spike.winner = 'attackers';
      spike.result = 'exploded';
      return { winner: 'attackers', result: 'exploded' };
    }
  }
  return null;
}

export function spikeStateForRoom(room, now = Date.now()) {
  return room.spike ? {
    phase: room.spike.phase,
    carrierId: room.spike.carrierId,
    carrierNickname: room.spike.carrierId
      ? room.members.get(room.spike.carrierId)?.nickname ?? null
      : null,
    position: room.spike.position ? { ...room.spike.position } : null,
    site: room.spike.site,
    plantingId: room.spike.plantingId,
    defuserId: room.spike.defuserId,
    plantProgressMs: room.spike.plantProgressMs,
    defuseProgressMs: room.spike.defuseProgressMs,
    detonateAt: room.spike.detonateAt,
    remainingMs: room.spike.phase === 'planted' ? Math.max(0, room.spike.detonateAt - now) : 0,
    winner: room.spike.winner,
    result: room.spike.result,
  } : null;
}
