import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, addRoomMember, selectRoomTeam } from '../server/rooms.js';
import {
  assignSpikeCarrier,
  createSpikeState,
  DETONATION_DURATION_MS,
  tickSpike,
} from '../server/spike.js';
import { createStalkerPlayer } from '../server/crimson-stalker.js';

function createSpikeMatch() {
  const room = createRoom('attacker-a', 'Attacker A', new Set(), () => 0);
  addRoomMember(room, 'defender', 'Defender');
  selectRoomTeam(room, 'attacker-a', 'attackers');
  selectRoomTeam(room, 'defender', 'defenders');
  const carrier = createStalkerPlayer('attacker-a', 0, 1000, 'kaneca', 'attackers');
  const teammate = createStalkerPlayer('attacker-b', 1, 1000, 'kaneca', 'attackers');
  teammate.nickname = 'Attacker B';
  room.members.set(teammate.id, {
    id: teammate.id,
    nickname: teammate.nickname,
    agent: 'kaneca',
    team: 'attackers',
    kills: 0,
  });
  const defender = createStalkerPlayer('defender', 2, 1000, 'kaneca', 'defenders');
  const players = new Map([
    [carrier.id, carrier],
    [teammate.id, teammate],
    [defender.id, defender],
  ]);
  assignSpikeCarrier(room, () => 0);
  return { room, players, carrier, teammate, defender };
}

test('one random attacker carries the spike and planting needs three uninterrupted seconds on site', () => {
  const { room, players, carrier } = createSpikeMatch();
  assert.equal(room.spike.carrierId, carrier.id);
  carrier.position = { x: -26, z: 0 };
  carrier.input.interact = true;
  assert.equal(tickSpike(room, players, 1, 1000), null);
  assert.equal(room.spike.plantProgressMs, 1000);
  carrier.input.interact = false;
  tickSpike(room, players, 1 / 30, 1033);
  assert.equal(room.spike.plantProgressMs, 0);
  carrier.input.interact = true;
  tickSpike(room, players, 3, 5000);
  assert.equal(room.spike.phase, 'planted');
  assert.equal(room.spike.site, 'A');
  assert.equal(room.spike.detonateAt, 40_000);
});

test('defenders must hold interact for four seconds to defuse the planted spike', () => {
  const { room, players, carrier, defender } = createSpikeMatch();
  room.spike = createSpikeState();
  room.spike.phase = 'planted';
  room.spike.position = { x: -26, y: 0, z: 0 };
  room.spike.site = 'A';
  room.spike.detonateAt = 50_000;
  defender.position = { x: -26, z: 0 };
  defender.input.interact = true;
  assert.equal(tickSpike(room, players, 3, 1000), null);
  assert.equal(room.spike.defuseProgressMs, 3000);
  defender.input.interact = false;
  tickSpike(room, players, 1 / 30, 1033);
  assert.equal(room.spike.defuseProgressMs, 0);
  defender.input.interact = true;
  const result = tickSpike(room, players, 4, 6000);
  assert.deepEqual(result, { winner: 'defenders', result: 'defused' });
  assert.equal(room.spike.phase, 'resolved');
  assert.notEqual(carrier.id, defender.id);
});

test('planted spike explodes after 35 seconds and dropped spike can be recovered by attackers', () => {
  const { room, players, carrier, teammate } = createSpikeMatch();
  carrier.position = { x: -10, z: 0 };
  carrier.alive = false;
  tickSpike(room, players, 1 / 30, 1000);
  assert.equal(room.spike.phase, 'dropped');
  assert.deepEqual(room.spike.position, { x: -10, y: 0, z: 0 });

  teammate.position = { x: -10, z: 0 };
  teammate.input.interact = true;
  tickSpike(room, players, 1 / 30, 1033);
  assert.equal(room.spike.phase, 'carried');
  assert.equal(room.spike.carrierId, teammate.id);

  room.spike.phase = 'planted';
  room.spike.position = { x: 28, y: 0, z: 0 };
  room.spike.detonateAt = 10_000;
  const result = tickSpike(room, players, 0, 10_000 + DETONATION_DURATION_MS);
  assert.deepEqual(result, { winner: 'attackers', result: 'exploded' });
});
