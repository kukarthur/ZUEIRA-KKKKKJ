import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addRoomMember,
  createRoom,
  createRoomCode,
  normalizeNickname,
  removeRoomMember,
  roomSnapshot,
  selectRoomAgent,
  selectRoomMap,
  selectRoomTeam,
  startRoomMatch,
} from '../server/rooms.js';
import { createStalkerPlayer } from '../server/crimson-stalker.js';
import { useSatoroAbility, tickSatoro } from '../server/satoro-bozo.js';
import * as THREE from 'three';
import { SatoroBozo } from '../src/SatoroBozo.js';

test('private rooms use unique five-character codes and validate lobby options', () => {
  const room = createRoom('host', 'Host', new Set(['NNNNN']), () => 0);
  assert.equal(room.code, 'AAAAA');
  assert.equal(createRoomCode(new Set(), () => 0.5).length, 5);
  assert.equal(normalizeNickname('  User   Name '), 'User Name');
  assert.equal(normalizeNickname('   '), null);
  assert.equal(addRoomMember(room, 'guest', 'Guest').ok, true);
  assert.equal(selectRoomAgent(room, 'guest', 'satoro').ok, true);
  assert.equal(selectRoomAgent(room, 'guest', 'barutcho').ok, true);
  assert.equal(selectRoomAgent(room, 'guest', 'zorbao').ok, true);
  assert.equal(selectRoomAgent(room, 'guest', 'unknown').reason, 'invalid-agent');
  assert.equal(selectRoomMap(room, 'guest', 'shibuya-night').reason, 'owner-only');
  assert.equal(selectRoomMap(room, 'host', 'shibuya-night').ok, true);
  assert.equal(selectRoomMap(room, 'host', 'templo-sakura').ok, true);
  assert.equal(roomSnapshot(room).players[1].agent, 'zorbao');
  assert.equal(roomSnapshot(room).map, 'templo-sakura');
  assert.equal(startRoomMatch(room, 1000).ok, true);
  assert.equal(addRoomMember(room, 'late', 'Late').reason, 'room-running');
});

test('only two or more players may start a round and a host is reassigned on leave', () => {
  const room = createRoom('host', 'Host', new Set(), () => 0);
  assert.equal(startRoomMatch(room, 1000).reason, 'need-two-players');
  addRoomMember(room, 'guest', 'Guest');
  selectRoomTeam(room, 'guest', 'attackers');
  assert.equal(startRoomMatch(room, 1000).reason, 'need-both-teams');
  assert.equal(selectRoomTeam(room, 'guest', 'defenders').ok, true);
  assert.deepEqual(startRoomMatch(room, 1000), { ok: true });
  assert.equal(removeRoomMember(room, 'host').empty, false);
  assert.equal(room.ownerId, 'guest');
});

test('Satoro Bozo validates ability cooldowns and server-side damage', () => {
  const satoro = createStalkerPlayer('satoro', 0, 1000, 'satoro');
  const target = createStalkerPlayer('target', 1, 1000);
  satoro.position = { x: 0, z: 0 };
  target.position = { x: 0, z: -4 };
  target.health = 200;
  const players = new Map([[satoro.id, satoro], [target.id, target]]);

  const repulse = useSatoroAbility(satoro, 'repulse', players, 1000);
  assert.equal(repulse.ok, true);
  assert.equal(repulse.hits[0].damage, 45);
  assert.equal(target.health, 155);
  assert.equal(useSatoroAbility(satoro, 'repulse', players, 1001).reason, 'cooldown');

  target.position = { x: 0, z: -8 };
  const gravity = useSatoroAbility(satoro, 'gravity', players, 20_000);
  assert.equal(gravity.ok, true);
  assert.ok(gravity.point.z < -10);
  const before = target.position.z;
  tickSatoro(satoro, players, 20_033);
  assert.ok(target.position.z < before);

  satoro.ultimate = 7;
  const charge = useSatoroAbility(satoro, 'void', players, 23_000);
  assert.equal(charge.charging, true);
  assert.equal(satoro.ultimate, 0);
  const completed = tickSatoro(satoro, players, 24_001);
  assert.equal(completed.ability, 'void');
});

test('Satoro teleport stops at ten metres and enforces its cooldown', () => {
  const satoro = createStalkerPlayer('satoro', 0, 1000, 'satoro');
  satoro.position = { x: 0, z: 0 };
  const result = useSatoroAbility(satoro, 'teleport', new Map([[satoro.id, satoro]]), 1000);
  assert.equal(result.ok, true);
  assert.equal(result.teleport.distance, 10);
  assert.equal(satoro.position.z, -10);
  assert.equal(useSatoroAbility(satoro, 'teleport', new Map([[satoro.id, satoro]]), 1001).reason, 'cooldown');
});

test('Satoro has a named low-poly scene model with crouch support', () => {
  const scene = new THREE.Scene();
  const character = new SatoroBozo(scene, 'test');
  assert.equal(character.group.name, 'Satoro Bozo test');
  character.setCrouching(true);
  assert.equal(character.group.scale.y, 0.61);
  character.setCrouching(false);
  character.dispose();
  assert.equal(scene.children.length, 0);
});
