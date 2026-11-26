import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARENA_LIMIT,
  findShotTarget,
  getAimDirection,
  movePlayer,
  normalizeInput,
} from '../server/game.js';

test('normalizes movement input and clamps look pitch', () => {
  const input = normalizeInput({
    forward: true,
    right: true,
    yaw: Math.PI * 3,
    pitch: 10,
  });

  assert.equal(input.forward, true);
  assert.equal(input.right, true);
  assert.equal(input.left, false);
  assert.ok(Math.abs(input.yaw - Math.PI) < 1e-10);
  assert.ok(input.pitch < 1.46);
  assert.equal(normalizeInput({ forward: true }), null);
});

test('moves diagonally at the same speed and stays inside the arena', () => {
  const player = {
    position: { x: ARENA_LIMIT - 0.1, z: 0 },
    input: { forward: true, backward: false, left: false, right: true, yaw: 0 },
  };

  movePlayer(player, 1);
  assert.equal(player.position.x, ARENA_LIMIT);
  assert.ok(player.position.z < 0);
  assert.ok(Math.abs(player.position.z) < 5);
});

test('ray hits the nearest living opponent and ignores the shooter', () => {
  const shooter = { id: 'one', position: { x: 0, z: 0 } };
  const nearTarget = { id: 'two', position: { x: 0, z: -5 }, alive: true };
  const farTarget = { id: 'three', position: { x: 0, z: -9 }, alive: true };
  const players = new Map([
    [shooter.id, shooter],
    [nearTarget.id, nearTarget],
    [farTarget.id, farTarget],
  ]);
  const hit = findShotTarget(shooter, players, getAimDirection(0, 0));

  assert.equal(hit.target.id, nearTarget.id);
  assert.ok(hit.distance > 0);
});
