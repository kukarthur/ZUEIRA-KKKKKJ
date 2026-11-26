import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createStalkerPlayer,
  damageStalker,
  findStalkerShotTarget,
  getStalkerAim,
  HIT_REGION_DAMAGE,
  moveStalker,
  normalizeStalkerInput,
  formatStalkerHealth,
  mapHasClearance,
  resolveStalkerShot,
  serializeStalker,
  REGEN_INTERVAL_MS,
  tickStalker,
  useStalkerAbility,
} from '../server/crimson-stalker.js';
import { colliders, createMap } from '../src/map.js';
import { CrimsonStalker } from '../src/CrimsonStalker.js';
import { MAP_DEFINITIONS, MAP_SOLIDS } from '../src/map-data.js';

test('spawns teams at opposite avenue ends and clamps player input', () => {
  const attacker = createStalkerPlayer('a', 0, 1000);
  const defender = createStalkerPlayer('b', 1, 1000);
  assert.equal(attacker.team, 'attackers');
  assert.equal(defender.team, 'defenders');
  assert.ok(Math.abs(attacker.position.z - defender.position.z) > 80);

  const input = normalizeStalkerInput({ forward: true, yaw: 0, pitch: 8 });
  assert.equal(input.forward, true);
  assert.ok(input.pitch < 1.46);
  assert.equal(normalizeStalkerInput({ yaw: 'north', pitch: 0 }), null);
});

test('clamps analog movement axes and preserves gradual joystick speed', () => {
  const analog = createStalkerPlayer('analog', 0, 1000);
  const full = createStalkerPlayer('full', 1, 1000);
  analog.position = { x: 0, z: 30 };
  full.position = { x: 0, z: 30 };
  analog.yaw = 0;
  full.yaw = 0;
  analog.input = normalizeStalkerInput({ moveY: 0.25, moveX: 0, yaw: 0, pitch: 0 });
  full.input = normalizeStalkerInput({ moveY: 1, moveX: 0, yaw: 0, pitch: 0 });
  assert.equal(normalizeStalkerInput({ moveX: 4, moveY: -4, yaw: 0, pitch: 0 }).moveX, 1);
  assert.equal(normalizeStalkerInput({ moveX: 4, moveY: -4, yaw: 0, pitch: 0 }).moveY, -1);

  moveStalker(analog, 0.1, 1000);
  moveStalker(full, 0.1, 1000);
  const analogDistance = 30 - analog.position.z;
  const fullDistance = 30 - full.position.z;
  assert.ok(Math.abs(analogDistance / fullDistance - 0.25) < 0.01);
});

test('blocks player movement at map cover', () => {
  const player = createStalkerPlayer('a', 0, 1000);
  player.position = { x: 17.2, z: -8 };
  player.yaw = Math.PI / 2;
  player.input = { forward: true, backward: false, left: false, right: false, yaw: player.yaw, pitch: 0 };
  moveStalker(player, 1, 1000);
  assert.ok(player.position.x < 17.8);
});

test('server shots stop on a car collider before reaching a player', () => {
  const shooter = createStalkerPlayer('a', 0, 1000);
  const target = createStalkerPlayer('b', 1, 1000);
  shooter.position = { x: -5.8, z: 0 };
  target.position = { x: -5.8, z: -30 };
  target.alive = true;
  const hit = findStalkerShotTarget(
    shooter,
    new Map([[shooter.id, shooter], [target.id, target]]),
    getStalkerAim(0, 0),
  );
  assert.equal(hit, null);
});

test('server shots pass through teammates to the nearest opponent', () => {
  const shooter = createStalkerPlayer('a', 0, 1000);
  const teammate = createStalkerPlayer('mate', 2, 1000);
  const enemy = createStalkerPlayer('enemy', 1, 1000);
  shooter.position = { x: 0, z: 0 };
  teammate.position = { x: 0, z: -4 };
  enemy.position = { x: 0, z: -8 };
  const hit = findStalkerShotTarget(
    shooter,
    new Map([[shooter.id, shooter], [teammate.id, teammate], [enemy.id, enemy]]),
    getStalkerAim(0, 0),
  );
  assert.equal(hit.target.id, enemy.id);
});

test('two-player state and server shot handler confirm hit, damage, tracer, and cooldown', () => {
  const attacker = createStalkerPlayer('a', 0, 1000);
  const defender = createStalkerPlayer('b', 1, 1000);
  attacker.position = { x: 0, z: 0 };
  defender.position = { x: 0, z: -5 };
  defender.health = 150;

  const roster = [attacker, defender].map((player) => serializeStalker(player, 1000));
  assert.deepEqual(roster.map(({ team }) => team), ['attackers', 'defenders']);
  const players = new Map([[attacker.id, attacker], [defender.id, defender]]);
  const shot = resolveStalkerShot(attacker, players, 1001, 23);
  assert.equal(shot.ok, true);
  assert.equal(shot.shot.shotId, 23);
  assert.equal(shot.damage.targetId, defender.id);
  assert.equal(shot.damage.damage, HIT_REGION_DAMAGE.head);
  assert.equal(shot.damage.region, 'head');
  assert.equal(shot.damage.isHeadshot, true);
  assert.ok(shot.shot.hitPoint.z > defender.position.z);
  assert.equal(defender.health, 30);
  assert.equal(resolveStalkerShot(attacker, players, 1100, 24).reason, 'cooldown');
});

test('regional shots deal 120 head, 40 torso and 25 leg damage', () => {
  for (const [pitch, region, damage] of [
    [0, 'head', 120],
    [-0.07, 'torso', 40],
    [-0.25, 'legs', 25],
  ]) {
    const attacker = createStalkerPlayer('a', 0, 1000);
    const target = createStalkerPlayer('b', 1, 1000);
    attacker.position = { x: 0, z: 0 };
    attacker.pitch = pitch;
    target.position = { x: 0, z: -5 };
    target.health = 200;
    const shot = resolveStalkerShot(attacker, new Map([[attacker.id, attacker], [target.id, target]]), 1001, 1);
    assert.equal(shot.damage.region, region);
    assert.equal(shot.damage.damage, damage);
    assert.equal(shot.damage.isHeadshot, region === 'head');
  }
});

test('jump and crouch are simulated and replicated with the player state', () => {
  const player = createStalkerPlayer('a', 0, 1000);
  player.input = { forward: false, backward: false, left: false, right: false, crouch: true, jump: false, yaw: 0, pitch: 0 };
  moveStalker(player, 1 / 30, 1000);
  assert.equal(serializeStalker(player, 1000).isCrouching, true);
  assert.equal(player.y, 0);

  player.input.crouch = false;
  player.input.jump = true;
  moveStalker(player, 1 / 30, 1033);
  assert.ok(player.y > 0);
  assert.equal(player.grounded, false);
  assert.equal(serializeStalker(player, 1033).y, player.y);
  assert.equal(serializeStalker(player, 1033).isCrouching, false);

  player.input.jump = false;
  for (let frame = 0; frame < 60; frame += 1) moveStalker(player, 1 / 30, 1066 + frame * 33);
  assert.equal(player.y, 0);
  assert.equal(player.grounded, true);
});

test('dash, whip damage and cooldown are validated by the server', () => {
  const attacker = createStalkerPlayer('a', 0, 1000);
  const target = createStalkerPlayer('b', 1, 1000);
  attacker.position = { x: 0, z: 0 };
  attacker.yaw = 0;
  target.position = { x: 0, z: -5 };
  const players = new Map([[attacker.id, attacker], [target.id, target]]);

  const dash = useStalkerAbility(attacker, 'dash', players, 1000);
  assert.equal(dash.ok, true);
  assert.equal(Math.round(dash.dash.distance), 12);
  assert.equal(useStalkerAbility(attacker, 'dash', players, 1001).reason, 'cooldown');

  attacker.position = { x: 0, z: 0 };
  const whip = useStalkerAbility(attacker, 'whip', players, 1000);
  assert.equal(whip.hits[0].damage, 45);
  assert.equal(target.health, 55);
  assert.equal(target.slowedUntil, 3000);
});

test('shield absorbs up to 150 from the front and fury costs seven points', () => {
  const defender = createStalkerPlayer('b', 1, 1000);
  defender.position = { x: 0, z: 0 };
  defender.yaw = 0;
  const source = { x: 0, z: -3 };
  useStalkerAbility(defender, 'shield', new Map([[defender.id, defender]]), 1000);
  const hit = damageStalker(defender, 200, 1100, source);
  assert.equal(hit.shieldDamage, 150);
  assert.equal(defender.health, 50);

  const player = createStalkerPlayer('a', 0, 1000);
  const target = createStalkerPlayer('b', 1, 1000);
  player.position = { x: 0, z: 0 };
  target.position = { x: 2, z: 0 };
  const players = new Map([[player.id, player], [target.id, target]]);
  assert.equal(useStalkerAbility(player, 'fury', players, 1000).reason, 'ultimate');
  player.ultimate = 7;
  const fury = useStalkerAbility(player, 'fury', players, 1000);
  assert.equal(fury.ok, true);
  assert.equal(player.ultimate, 0);
  assert.equal(target.health, 100);
  const melee = useStalkerAbility(player, 'whip', players, 1001);
  assert.equal(melee.hits[0].damage, 90);
  assert.equal(target.health, 10);
  assert.equal(serializeStalker(player, 1001).fury, true);
});

test('passive regeneration heals one whole HP every five seconds and is capped at 50 HP', () => {
  const player = createStalkerPlayer('a', 0, 1000);
  player.health = 40;
  assert.equal(tickStalker(player, 1 / 30, 5999), 0);
  assert.equal(tickStalker(player, 1 / 30, 6000), 1);
  assert.equal(player.health, 41);
  assert.equal(tickStalker(player, 1 / 30, 10999), 0);
  assert.equal(tickStalker(player, 1 / 30, 11000), 1);
  assert.equal(player.health, 42);
  assert.equal(REGEN_INTERVAL_MS, 5000);
  assert.equal(formatStalkerHealth(60.02499998), 61);

  player.health = 50;
  player.regenerated = 49;
  assert.equal(tickStalker(player, 1 / 30, 16000), 1);
  assert.equal(player.regenerated, 50);
  assert.equal(tickStalker(player, 1 / 30, 21000), 0);
});

test('exports Box3 cover for map solids and builds a four-tentacle character', () => {
  const scene = new THREE.Scene();
  const map = createMap(scene);
  assert.equal(colliders.length, MAP_SOLIDS.length);
  assert.ok(colliders.every((box) => box instanceof THREE.Box3));
  assert.equal(map.namedColliders.find(({ name }) => name === 'mid-car-1').kind, 'car');
  let verticalNeonSigns = 0;
  scene.traverse((object) => {
    if (
      object.isMesh
      && object.geometry.parameters?.height >= 7
      && object.material.emissiveIntensity >= 3
    ) verticalNeonSigns++;
  });

  assert.ok(verticalNeonSigns >= 24);

  const character = new CrimsonStalker(scene, 'test');
  assert.equal(character.tentacles.length, 4);
  assert.ok(character.tentacles.every(({ joints }) => joints.length === 4));
  assert.equal(character.limbs.length, 4);
  const initialLegAngle = character.limbs.find(({ kind }) => kind === 'leg').pivot.rotation.x;
  const initialArmAngle = character.limbs.find(({ kind }) => kind === 'arm').pivot.rotation.x;
  const initialTentacleAngle = character.tentacles[0].root.rotation.z;
  character.setMoveSpeed(6);
  character.update(0.2);
  assert.notEqual(character.limbs.find(({ kind }) => kind === 'leg').pivot.rotation.x, initialLegAngle);
  assert.notEqual(character.limbs.find(({ kind }) => kind === 'arm').pivot.rotation.x, initialArmAngle);
  assert.notEqual(character.tentacles[0].root.rotation.z, initialTentacleAngle);
  assert.ok([...character.materials].some((material) => material.emissiveIntensity >= 3));
  character.setShield(true);
  character.setFury(true);
  character.dispose();
  assert.ok(scene.children.some((object) => object.isAmbientLight));
});

test('Templo Sakura keeps three open lanes and exports collision boxes for the shrine', () => {
  const scene = new THREE.Scene();
  const map = createMap(scene, 'templo-sakura');
  const names = new Set(map.namedColliders.map(({ name }) => name));
  assert.equal(map.colliders.length, MAP_DEFINITIONS['templo-sakura'].solids.length);
  assert.ok(map.colliders.every((box) => box instanceof THREE.Box3));
  assert.ok(names.has('temple-core'));
  assert.ok(names.has('torii-a-post-west'));
  assert.ok(names.has('tree-west-north'));
  assert.ok(names.has('lantern-a-west'));
  assert.equal(mapHasClearance(0, -20, 0, 1.8, 'templo-sakura'), false);
  assert.equal(mapHasClearance(-22, 0, 0, 1.8, 'templo-sakura'), true);
  assert.equal(mapHasClearance(22, 0, 0, 1.8, 'templo-sakura'), true);
});
