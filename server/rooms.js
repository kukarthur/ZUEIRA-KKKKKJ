import { randomInt } from 'node:crypto';
import { MAP_DEFINITIONS } from '../src/map-data.js';

const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 5;

export function createRoomCode(existingCodes, random) {
  const nextRandom = random
    ?? (() => randomInt(0, ROOM_CODE_CHARACTERS.length) / ROOM_CODE_CHARACTERS.length);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let code = '';
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      code += ROOM_CODE_CHARACTERS[Math.floor(nextRandom() * ROOM_CODE_CHARACTERS.length)];
    }
    if (!existingCodes.has(code)) return code;
  }
  throw new Error('Não foi possível gerar um código de sala único.');
}

export function normalizeNickname(value) {
  if (typeof value !== 'string') return null;
  const nickname = value.trim().replace(/\s+/g, ' ').slice(0, 20);
  return nickname.length > 0 ? nickname : null;
}

export function createRoom(ownerId, nickname, existingCodes = new Set(), random) {
  return {
    code: createRoomCode(existingCodes, random),
    ownerId,
    phase: 'lobby',
    map: 'shibuya-night',
    round: 0,
    roundsWon: { attackers: 0, defenders: 0 },
    nextRoundAt: 0,
    roundEndsAt: 0,
    temporaryWalls: [],
    iceFields: [],
    storms: [],
    members: new Map([[ownerId, { id: ownerId, nickname, agent: 'kaneca', team: 'attackers', kills: 0 }]]),
  };
}

export function addRoomMember(room, id, nickname) {
  if (!room || room.phase !== 'lobby') return { ok: false, reason: 'room-running' };
  if (room.members.has(id)) return { ok: true };
  room.members.set(id, {
    id,
    nickname,
    agent: 'kaneca',
    team: room.members.size % 2 === 0 ? 'attackers' : 'defenders',
    kills: 0,
  });
  return { ok: true };
}

export function selectRoomTeam(room, playerId, team) {
  if (!room || room.phase !== 'lobby' || !room.members.has(playerId)) {
    return { ok: false, reason: 'unavailable' };
  }
  if (team !== 'attackers' && team !== 'defenders') return { ok: false, reason: 'invalid-team' };
  room.members.get(playerId).team = team;
  return { ok: true };
}

export function roomSnapshot(room) {
  return {
    code: room.code,
    ownerId: room.ownerId,
    phase: room.phase,
    map: room.map,
    round: room.round,
    roundsWon: { ...room.roundsWon },
    players: [...room.members.values()].map(({ id, nickname, agent, team, kills }) => ({
      id, nickname, agent, team, kills,
    })),
  };
}

export function selectRoomAgent(room, playerId, agent) {
  if (!room || room.phase !== 'lobby' || !room.members.has(playerId)) {
    return { ok: false, reason: 'unavailable' };
  }
  if (!['kaneca', 'satoro', 'barutcho', 'zorbao'].includes(agent)) {
    return { ok: false, reason: 'invalid-agent' };
  }
  room.members.get(playerId).agent = agent;
  return { ok: true };
}

export function selectRoomMap(room, playerId, map) {
  if (!room || room.phase !== 'lobby') return { ok: false, reason: 'unavailable' };
  if (room.ownerId !== playerId) return { ok: false, reason: 'owner-only' };
  if (!Object.hasOwn(MAP_DEFINITIONS, map)) return { ok: false, reason: 'invalid-map' };
  room.map = map;
  return { ok: true };
}

export function startRoomMatch(room, now = Date.now()) {
  if (!room || room.ownerId === undefined || room.phase !== 'lobby') {
    return { ok: false, reason: 'unavailable' };
  }
  if (room.members.size < 2) return { ok: false, reason: 'need-two-players' };
  const teams = new Set([...room.members.values()].map(({ team }) => team));
  if (!teams.has('attackers') || !teams.has('defenders')) return { ok: false, reason: 'need-both-teams' };
  room.phase = 'match';
  room.round = 1;
  room.roundEndsAt = now + 120_000;
  room.nextRoundAt = 0;
  room.roundsWon = { attackers: 0, defenders: 0 };
  for (const member of room.members.values()) member.kills = 0;
  return { ok: true };
}

export function removeRoomMember(room, playerId) {
  if (!room) return { empty: true };
  room.members.delete(playerId);
  if (room.ownerId === playerId) room.ownerId = room.members.keys().next().value;
  return { empty: room.members.size === 0 };
}
