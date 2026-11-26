import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createStalkerPlayer,
  damageStalker,
  moveStalker,
  resolveStalkerShot,
  serializeStalker,
  tickStalker,
} from '../server/crimson-stalker.js';
import { tickTacticalAgents, useBarutchoAbility, useZorbaoAbility } from '../server/tactical-agents.js';
import { Barutcho } from '../src/Barutcho.js';
import { Zorbao } from '../src/Zorbao.js';

function createMatch(barutchoTeam = 'attackers', zorbaoTeam = 'defenders') {
  const barutcho = createStalkerPlayer('barutcho', 0, 0, 'barutcho', barutchoTeam);
  const zorbao = createStalkerPlayer('zorbao', 1, 0, 'zorbao', zorbaoTeam);
  const players = new Map([[barutcho.id, barutcho], [zorbao.id, zorbao]]);
  const room = { temporaryWalls: [], iceFields: [], storms: [] };
  for (const player of players.values()) {
    player.temporaryWalls = room.temporaryWalls;
    player.iceFields = room.iceFields;
    player.storms = room.storms;
  }
  return { barutcho, zorbao, players, room };
}

test('new tactical agents provide their low-poly models and animations', () => {
  const scene = new THREE.Scene();
  const barutcho = new Barutcho(scene, 'b');
  const zorbao = new Zorbao(scene, 'z');

  assert.equal(barutcho.agent, 'barutcho');
  assert.equal(zorbao.agent, 'zorbao');
  assert.ok(barutcho.thrusters.length >= 2);
  assert.ok(zorbao.thermalShield.isMesh);
  assert.ok(zorbao.group.children.length > 1);
  barutcho.setMoveSpeed(6);
  zorbao.setMoveSpeed(6);
  barutcho.setBoost(true);
  barutcho.update(0.5);
  zorbao.update(0.5);
  barutcho.dispose();
  zorbao.dispose();
  assert.equal(scene.children.length, 0);
});

test('Barutcho sonar reveals opponents in range and enforces its cooldown', () => {
  const { barutcho, zorbao, players } = createMatch();
  barutcho.position = { x: 0, z: 0 };
  zorbao.position = { x: 0, z: -9 };

  const result = useBarutchoAbility(barutcho, 'sonar', players, 1000);
  assert.deepEqual(result.revealedTargets.map(({ playerId }) => playerId), [zorbao.id]);
  assert.equal(result.durationMs, 3000);
  assert.equal(useBarutchoAbility(barutcho, 'sonar', players, 1001).reason, 'cooldown');
  assert.equal(serializeStalker(barutcho, 1000).cooldowns.sonar, 15000);
});

test('Barutcho flash affects only enemies facing the flash and propulsion is bounded by cooldown', () => {
  const { barutcho, zorbao, players } = createMatch();
  barutcho.position = { x: 0, z: 0 };
  barutcho.yaw = 0;
  zorbao.position = { x: 0, z: -6 };
  zorbao.yaw = 0;
  const flash = useBarutchoAbility(barutcho, 'flash', players, 1000);
  assert.deepEqual(flash.flashedTargets, [zorbao.id]);
  assert.equal(flash.durationMs, 2000);
  assert.equal(zorbao.flashedUntil, 3000);
  assert.equal(useBarutchoAbility(barutcho, 'flash', players, 1001).reason, 'cooldown');

  zorbao.yaw = Math.PI;
  const facingAway = useBarutchoAbility(barutcho, 'flash', players, 18_000);
  assert.deepEqual(facingAway.flashedTargets, []);

  barutcho.position = { x: 0, z: 40 };
  barutcho.yaw = 0;
  barutcho.input.forward = true;
  const propulsion = useBarutchoAbility(barutcho, 'propel', players, 20_000);
  assert.ok(Math.abs(propulsion.dash.distance - 8) < 0.01);
  assert.equal(barutcho.barutchoBoostUntil, 23_000);
  assert.equal(useBarutchoAbility(barutcho, 'propel', players, 20_001).reason, 'cooldown');

  const start = barutcho.position.z;
  moveStalker(barutcho, 1, 21_000);
  assert.ok(Math.abs(start - barutcho.position.z - 7.2) < 0.01);
});

test('Barutcho sonic cannon spends seven points, damages and knocks back enemies along its beam', () => {
  const { barutcho, zorbao, players } = createMatch();
  barutcho.ultimate = 7;
  barutcho.position = { x: 0, z: 0 };
  barutcho.yaw = 0;
  zorbao.position = { x: 0, z: -8 };
  zorbao.health = 200;

  const result = useBarutchoAbility(barutcho, 'sonic', players, 1000);
  assert.equal(result.hits.length, 1);
  assert.equal(result.end.z - result.origin.z, -18);
  assert.equal(result.hits[0].damage, 110);
  assert.equal(zorbao.health, 90);
  assert.equal(zorbao.knockback.z, -8);
  assert.equal(barutcho.ultimate, 0);
  assert.equal(useBarutchoAbility(barutcho, 'sonic', players, 1001).reason, 'ultimate');
});

test('Zorbão wall blocks movement and gunfire until 200 damage destroys it', () => {
  const { barutcho, zorbao, players, room } = createMatch();
  zorbao.position = { x: 0, z: 0 };
  zorbao.yaw = 0;
  const placed = useZorbaoAbility(zorbao, 'wall', players, 1000);
  assert.equal(placed.wall.halfWidth, 3);
  assert.equal(placed.wall.height, 2.8);
  assert.equal(placed.wall.health, 200);
  assert.equal(placed.wall.expiresAt, 9000);
  assert.equal(serializeStalker(zorbao, 1000).cooldowns.wall, 18_000);
  assert.equal(useZorbaoAbility(zorbao, 'wall', players, 1001).reason, 'cooldown');

  zorbao.input.forward = true;
  moveStalker(zorbao, 1, 1100);
  assert.ok(zorbao.position.z > placed.wall.position.z);

  barutcho.position = { x: 0, z: -8 };
  barutcho.yaw = Math.PI;
  for (let shot = 0; shot < 5; shot += 1) {
    const result = resolveStalkerShot(barutcho, players, 2000 + shot * 250, shot);
    assert.equal(result.wallHit.health, 160 - shot * 40);
    assert.equal(result.damage, null);
  }
  assert.equal(room.temporaryWalls.length, 0);
});

test('Zorbão freezing field slows enemies, thermal armor absorbs 40 damage, and storm deals seven ticks', () => {
  const { barutcho, zorbao, players } = createMatch();
  zorbao.position = { x: 0, z: 0 };
  zorbao.yaw = 0;
  barutcho.position = { x: 0, z: -9 };
  barutcho.yaw = 0;
  barutcho.input.forward = true;

  const field = useZorbaoAbility(zorbao, 'ice', players, 1000);
  assert.equal(field.field.radius, 5);
  assert.equal(field.field.expiresAt, 7000);
  assert.equal(serializeStalker(zorbao, 1000).cooldowns.ice, 16_000);
  tickTacticalAgents({ temporaryWalls: [], iceFields: zorbao.iceFields, storms: [] }, players, 1000);
  const start = barutcho.position.z;
  moveStalker(barutcho, 1, 1050);
  assert.ok(Math.abs(start - barutcho.position.z - 3.3) < 0.01);

  const armor = useZorbaoAbility(zorbao, 'thermal', players, 20_000);
  assert.equal(armor.health, 40);
  assert.equal(armor.expiresAt, 25_000);
  assert.equal(serializeStalker(zorbao, 20_000).cooldowns.thermal, 20_000);
  assert.equal(damageStalker(zorbao, 55, 20_001, barutcho.position).shieldDamage, 40);
  assert.equal(zorbao.health, 85);
  tickStalker(zorbao, 0.1, 25_100);
  assert.equal(zorbao.bonusShieldHealth, 0);

  zorbao.ultimate = 7;
  barutcho.position = { x: 0, z: -8 };
  barutcho.health = 200;
  const storm = useZorbaoAbility(zorbao, 'storm', players, 30_000);
  assert.equal(storm.storm.radius, 14);
  for (let second = 0; second <= 7; second += 1) {
    tickTacticalAgents(
      { temporaryWalls: [], iceFields: [], storms: zorbao.storms },
      players,
      30_000 + second * 1000,
    );
  }
  assert.equal(barutcho.health, 95);
  assert.equal(zorbao.ultimate, 0);
  assert.ok(barutcho.cryoSlowUntil > 36_000);
});
