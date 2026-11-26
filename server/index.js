import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import {
  createStalkerPlayer,
  moveStalker,
  normalizeStalkerInput,
  resolveStalkerShot,
  serializeStalker,
  tickStalker,
  useStalkerAbility,
} from './crimson-stalker.js';
import { useSatoroAbility, tickSatoro } from './satoro-bozo.js';
import { tickTacticalAgents, useBarutchoAbility, useZorbaoAbility } from './tactical-agents.js';
import {
  addRoomMember,
  createRoom,
  normalizeNickname,
  removeRoomMember,
  roomSnapshot,
  selectRoomAgent,
  selectRoomMap,
  selectRoomTeam,
  startRoomMatch,
} from './rooms.js';
import { assignSpikeCarrier, spikeStateForRoom, tickSpike } from './spike.js';

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '127.0.0.1';
if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT precisa ser um número entre 1 e 65535.');
}

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const players = new Map();
const rooms = new Map();
const membersBySocket = new Map();
const distPath = fileURLToPath(new URL('../dist/', import.meta.url));

if (existsSync(distPath)) app.use(express.static(distPath));

function acknowledge(callback, response) {
  if (typeof callback === 'function') callback(response);
}

function publishRoom(room) {
  io.to(room.code).emit('room:state', roomSnapshot(room));
}

function roomForSocket(socket) {
  const code = membersBySocket.get(socket.id)?.roomCode;
  return code ? rooms.get(code) : null;
}

function announceRound(room, message = 'round:state') {
  io.to(room.code).emit(message, {
    round: room.round,
    roundsWon: { ...room.roundsWon },
    roundEndsAt: room.roundEndsAt,
  });
}

function createRoundPlayers(room, now, reset = false) {
  for (const effects of [room.temporaryWalls, room.iceFields, room.storms]) effects.length = 0;
  let index = 0;
  for (const member of room.members.values()) {
    const previous = players.get(member.id);
    const player = createStalkerPlayer(member.id, index, now, member.agent, member.team, room.map);
    player.nickname = member.nickname;
    player.kills = reset ? (previous?.kills ?? member.kills) : 0;
    player.temporaryWalls = room.temporaryWalls;
    player.iceFields = room.iceFields;
    player.storms = room.storms;
    players.set(member.id, player);
    index += 1;
  }
  assignSpikeCarrier(room);
}

function removePlayerFromRound(id) {
  players.delete(id);
}

function dropCarriedSpike(room, id) {
  const player = players.get(id);
  if (room?.spike?.phase !== 'carried' || room.spike.carrierId !== id || !player) return;
  room.spike.phase = 'dropped';
  room.spike.carrierId = null;
  room.spike.position = { ...player.position, y: player.y };
  room.spike.plantingId = null;
  room.spike.plantProgressMs = 0;
}

function finishRound(room, winner, now, result = null) {
  if (room.phase !== 'match' || room.nextRoundAt) return;
  if (winner) room.roundsWon[winner] += 1;
  room.nextRoundAt = now + 4_000;
  room.spike.phase = 'resolved';
  room.spike.winner = winner;
  room.spike.result = result;
  io.to(room.code).emit('round:over', {
    round: room.round,
    winner,
    result,
    roundsWon: { ...room.roundsWon },
    nextRoundAt: room.nextRoundAt,
    spike: spikeStateForRoom(room),
  });
}

function evaluateRound(room, now) {
  if (room.phase !== 'match' || room.nextRoundAt) return;
  const members = [...room.members.values()];
  const livingTeams = new Set(members.flatMap(({ id, team }) => (
    players.get(id)?.alive ? [team] : []
  )));
  if (room.spike?.phase === 'planted') {
    if (!livingTeams.has('defenders')) finishRound(room, 'attackers', now, 'defenders-eliminated');
    return;
  }
  if (livingTeams.size === 1) {
    finishRound(room, [...livingTeams][0], now);
  } else if (livingTeams.size === 0 || now >= room.roundEndsAt) {
    const healthByTeam = { attackers: 0, defenders: 0 };
    for (const member of members) {
      const player = players.get(member.id);
      if (player?.alive) healthByTeam[member.team] += player.health;
    }
    const winner = healthByTeam.attackers === healthByTeam.defenders
      ? null
      : healthByTeam.attackers > healthByTeam.defenders ? 'attackers' : 'defenders';
    finishRound(room, winner, now);
  }
}

function publishHits(room, attacker, hits, now) {
  for (const hit of hits) {
    const target = players.get(hit.targetId);
    if (!target || (!hit.damage && !hit.shieldDamage)) continue;
    if (hit.killed) {
      attacker.kills += 1;
      const member = room.members.get(attacker.id);
      if (member) member.kills = attacker.kills;
    }
    io.to(room.code).emit('player:hit', {
      id: target.id,
      attackerId: attacker.id,
      health: target.health,
      damage: hit.damage,
      shieldDamage: hit.shieldDamage,
      shieldHealth: target.shieldHealth,
      ultimate: attacker.ultimate,
      isHeadshot: hit.isHeadshot === true,
      region: hit.region,
    });
  }
  evaluateRound(room, now);
}

function emitToTeam(room, team, event, payload) {
  for (const member of room.members.values()) {
    if (member.team === team) io.to(member.id).emit(event, payload);
  }
}

function revealTargets(room, team, targets, durationMs, color) {
  for (const target of targets) {
    emitToTeam(room, team, 'player:revealed', { ...target, durationMs, color });
  }
}

function handleRoomEntry(socket, code, nickname, callback) {
  const normalizedNickname = normalizeNickname(nickname);
  if (!normalizedNickname) {
    acknowledge(callback, { ok: false, reason: 'nickname-required' });
    return;
  }
  const room = rooms.get(code);
  if (!room) {
    acknowledge(callback, { ok: false, reason: 'room-not-found' });
    return;
  }
  const result = addRoomMember(room, socket.id, normalizedNickname);
  if (!result.ok) {
    acknowledge(callback, result);
    return;
  }
  membersBySocket.set(socket.id, { roomCode: room.code, nickname: normalizedNickname });
  socket.join(room.code);
  acknowledge(callback, { ok: true, room: roomSnapshot(room) });
  publishRoom(room);
}

io.on('connection', (socket) => {
  socket.emit('player:assigned', { id: socket.id });

  socket.on('room:create', (payload = {}, callback) => {
    const nickname = normalizeNickname(payload.nickname);
    if (!nickname) {
      acknowledge(callback, { ok: false, reason: 'nickname-required' });
      return;
    }
    if (membersBySocket.has(socket.id)) {
      acknowledge(callback, { ok: false, reason: 'already-in-room' });
      return;
    }
    const room = createRoom(socket.id, nickname, new Set(rooms.keys()));
    rooms.set(room.code, room);
    membersBySocket.set(socket.id, { roomCode: room.code, nickname });
    socket.join(room.code);
    acknowledge(callback, { ok: true, room: roomSnapshot(room) });
    publishRoom(room);
  });

  socket.on('room:join', (payload = {}, callback) => {
    if (membersBySocket.has(socket.id)) {
      acknowledge(callback, { ok: false, reason: 'already-in-room' });
      return;
    }
    const code = typeof payload.code === 'string' ? payload.code.trim().toUpperCase() : '';
    handleRoomEntry(socket, code, payload.nickname, callback);
  });

  socket.on('room:select-agent', (agent, callback) => {
    const room = roomForSocket(socket);
    const result = selectRoomAgent(room, socket.id, agent);
    acknowledge(callback, result);
    if (result.ok) publishRoom(room);
  });

  socket.on('room:select-team', (team, callback) => {
    const room = roomForSocket(socket);
    const result = selectRoomTeam(room, socket.id, team);
    acknowledge(callback, result);
    if (result.ok) publishRoom(room);
  });

  socket.on('room:select-map', (map, callback) => {
    const room = roomForSocket(socket);
    const result = selectRoomMap(room, socket.id, map);
    acknowledge(callback, result);
    if (result.ok) publishRoom(room);
  });

  socket.on('room:start', (_payload, callback) => {
    const room = roomForSocket(socket);
    if (!room || room.ownerId !== socket.id) {
      acknowledge(callback, { ok: false, reason: 'owner-only' });
      return;
    }
    const result = startRoomMatch(room, Date.now());
    acknowledge(callback, result);
    if (!result.ok) return;
    createRoundPlayers(room, Date.now());
    publishRoom(room);
    io.to(room.code).emit('match:started', roomSnapshot(room));
    announceRound(room);
  });

  socket.on('room:leave', (callback) => {
    const room = roomForSocket(socket);
    if (!room) {
      acknowledge(callback, { ok: true });
      return;
    }
    dropCarriedSpike(room, socket.id);
    removePlayerFromRound(socket.id);
    membersBySocket.delete(socket.id);
    socket.leave(room.code);
    const result = removeRoomMember(room, socket.id);
    if (result.empty) rooms.delete(room.code);
    else {
      publishRoom(room);
      if (room.phase === 'match') evaluateRound(room, Date.now());
    }
    acknowledge(callback, { ok: true });
  });

  socket.on('feedback:submit', (payload = {}, callback) => {
    const text = typeof payload.message === 'string' ? payload.message.trim().slice(0, 1000) : '';
    if (!text) {
      acknowledge(callback, { ok: false, reason: 'empty' });
      return;
    }
    console.log(`[feedback] ${socket.id}: ${text}`);
    acknowledge(callback, { ok: true });
  });

  socket.on('player:input', (payload) => {
    const player = players.get(socket.id);
    const input = normalizeStalkerInput(payload);
    if (!player?.alive || !input) return;
    player.input = input;
    player.yaw = input.yaw;
    player.pitch = input.pitch;
  });

  socket.on('player:shoot', (payload) => {
    const player = players.get(socket.id);
    const room = roomForSocket(socket);
    if (!room || room.phase !== 'match' || !player) return;
    const shotId = Number.isSafeInteger(payload?.shotId) ? payload.shotId : null;
    if (room.nextRoundAt) {
      socket.emit('player:shot-rejected', { shotId, reason: 'intermission' });
      return;
    }
    const roomPlayers = new Map([...room.members.keys()]
      .map((id) => [id, players.get(id)])
      .filter((entry) => entry[1]));
    const result = resolveStalkerShot(player, roomPlayers, Date.now(), shotId);
    if (!result.ok) {
      socket.emit('player:shot-rejected', { shotId, reason: result.reason });
      return;
    }
    io.to(room.code).emit('player:shot', result.shot);
    if (result.wallHit) io.to(room.code).emit('world:wall-damaged', result.wallHit);
    if (result.damage) publishHits(room, player, [result.damage], Date.now());
  });

  socket.on('player:ability', (payload) => {
    const player = players.get(socket.id);
    const room = roomForSocket(socket);
    if (!room || room.phase !== 'match' || !player) return;
    const ability = typeof payload === 'string' ? payload : payload?.ability;
    if (typeof ability !== 'string') {
      socket.emit('player:ability-result', { ok: false, reason: 'invalid' });
      return;
    }
    if (room.nextRoundAt) {
      socket.emit('player:ability-result', { ability, ok: false, reason: 'intermission', ultimate: player.ultimate });
      return;
    }
    const now = Date.now();
    const roomPlayers = new Map([...room.members.keys()]
      .map((id) => [id, players.get(id)])
      .filter((entry) => entry[1]));
    const result = player.agent === 'satoro'
      ? useSatoroAbility(player, ability, roomPlayers, now)
      : player.agent === 'barutcho'
        ? useBarutchoAbility(player, ability, roomPlayers, now)
        : player.agent === 'zorbao'
          ? useZorbaoAbility(player, ability, roomPlayers, now)
          : useStalkerAbility(player, ability, roomPlayers, now);
    socket.emit('player:ability-result', {
      ability,
      ok: result.ok,
      reason: result.reason,
      ultimate: player.ultimate,
    });
    if (!result.ok) return;
    if (result.ability === 'sonar') {
      revealTargets(room, player.team, result.revealedTargets, result.durationMs, 'cyan');
    }
    if (result.ability === 'flash') {
      for (const id of result.flashedTargets) {
        io.to(id).emit('player:flashed', { durationMs: result.durationMs });
      }
    }
    publishHits(room, player, result.hits ?? [], now);
    const { flashedTargets, revealedTargets, ...publicEffect } = result;
    io.to(room.code).emit('player:ability-effect', {
      playerId: player.id,
      ...publicEffect,
      ultimate: player.ultimate,
      furyUntil: player.furyUntil,
    });
  });

  socket.on('disconnect', () => {
    const room = roomForSocket(socket);
    dropCarriedSpike(room, socket.id);
    removePlayerFromRound(socket.id);
    membersBySocket.delete(socket.id);
    if (!room) return;
    const result = removeRoomMember(room, socket.id);
    if (result.empty) {
      rooms.delete(room.code);
      return;
    }
    publishRoom(room);
    if (room.phase === 'match') evaluateRound(room, Date.now());
  });
});

let previousTick = Date.now();
const tickRate = setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - previousTick) / 1000, 0.1);
  previousTick = now;

  for (const room of rooms.values()) {
    if (room.phase !== 'match') continue;
    if (room.nextRoundAt && now >= room.nextRoundAt) {
      if (Math.max(...Object.values(room.roundsWon)) >= 7) {
        room.phase = 'lobby';
        room.nextRoundAt = 0;
        room.roundEndsAt = 0;
        for (const id of room.members.keys()) removePlayerFromRound(id);
        publishRoom(room);
        io.to(room.code).emit('match:ended', { roundsWon: { ...room.roundsWon } });
        continue;
      }
      room.round += 1;
      room.nextRoundAt = 0;
      room.roundEndsAt = now + 120_000;
      createRoundPlayers(room, now, true);
      announceRound(room);
    }
    if (room.nextRoundAt) continue;
    const roomPlayers = new Map([...room.members.keys()]
      .map((id) => [id, players.get(id)])
      .filter((entry) => entry[1]));
    for (const { owner, hits } of tickTacticalAgents(room, roomPlayers, now)) {
      publishHits(room, owner, hits, now);
    }
    for (const player of roomPlayers.values()) {
      if (!player.alive) continue;
      if (now < player.aimDisruptedUntil) {
        player.yaw = player.input.yaw + Math.sin(now * 0.04) * 0.14;
      } else {
        player.yaw = player.input.yaw;
      }
      moveStalker(player, dt, now);
      const voidEffect = player.agent === 'satoro' ? tickSatoro(player, roomPlayers, now) : null;
      if (voidEffect) {
        publishHits(room, player, voidEffect.hits, now);
        io.to(room.code).emit('player:ability-effect', voidEffect);
      }
      tickStalker(player, dt, now);
    }
    const spikeResult = tickSpike(room, roomPlayers, dt, now);
    if (spikeResult) finishRound(room, spikeResult.winner, now, spikeResult.result);
    evaluateRound(room, now);
    io.to(room.code).emit('spike:state', spikeStateForRoom(room, now));
    io.to(room.code).emit('game:state', [...roomPlayers.values()]
      .map((player) => serializeStalker(player, now)));
  }
}, 1000 / 30);

httpServer.listen(PORT, HOST, () => {
  console.log(`Servidor FPS pronto em http://${HOST}:${PORT}`);
});

function shutdown() {
  clearInterval(tickRate);
  io.close();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
