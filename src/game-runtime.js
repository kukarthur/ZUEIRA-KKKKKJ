import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Barutcho } from './Barutcho.js';
import { CrimsonStalker } from './CrimsonStalker.js';
import { SatoroBozo } from './SatoroBozo.js';
import { Zorbao } from './Zorbao.js';
import { getMapDefinition } from './map-data.js';
import { createMap } from './map.js';

const MOVE_SPEED = 6;
const INPUT_INTERVAL = 1000 / 30;
const FIRE_INTERVAL = 250;
const SHOT_RANGE = 50;
const PLAYER_RADIUS = 0.42;
const DASH_FOV_DURATION = 250;
const AGENT_ABILITY_KEYS = {
  kaneca: { KeyC: 'dash', KeyQ: 'whip', KeyE: 'shield', KeyX: 'fury' },
  satoro: { KeyC: 'teleport', KeyQ: 'gravity', KeyE: 'repulse', KeyX: 'void' },
  barutcho: { KeyC: 'sonar', KeyQ: 'flash', KeyE: 'propel', KeyX: 'sonic' },
  zorbao: { KeyC: 'wall', KeyQ: 'ice', KeyE: 'thermal', KeyX: 'storm' },
};
const AGENT_ABILITY_LABELS = {
  kaneca: { dash: 'DASH', whip: 'CHICOTE', shield: 'ESCUDO', fury: 'FÚRIA', ultimate: 'MODO FÚRIA' },
  satoro: { teleport: 'TELEPORTE', gravity: 'ESFERA AZUL', repulse: 'REPULSÃO', void: 'VAZIO ROXO', ultimate: 'VAZIO ROXO' },
  barutcho: { sonar: 'PULSO SÍSMICO', flash: 'GRANADA DE LUZ', propel: 'PROPULSÃO', sonic: 'CANHÃO SÔNICO', ultimate: 'CANHÃO SÔNICO' },
  zorbao: { wall: 'MURALHA DE GELO', ice: 'CAMPO CONGELANTE', thermal: 'BLINDAGEM TÉRMICA', storm: 'NEVASCA TÁTICA', ultimate: 'NEVASCA TÁTICA' },
};
const AGENT_ABILITY_SHORT_LABELS = {
  kaneca: { dash: 'DASH', whip: 'CHICOTE', shield: 'ESCUDO', fury: 'FÚRIA' },
  satoro: { teleport: 'TELEP.', gravity: 'ATRAÇÃO', repulse: 'REPEL.', void: 'VAZIO' },
  barutcho: { sonar: 'SÍSMICO', flash: 'GRANADA', propel: 'JATOS', sonic: 'CANHÃO' },
  zorbao: { wall: 'MURALHA', ice: 'GELO', thermal: 'ARMADURA', storm: 'NEVASCA' },
};

export function createGameRuntime({ socket, settings, localId, mapId = 'shibuya-night', onExit }) {
  const canvas = document.querySelector('#game');
  const matchScreen = document.querySelector('#match-screen');
  const resumeScreen = document.querySelector('#resume-screen');
  const hud = document.querySelector('.hud');
  const healthLabel = document.querySelector('#health');
  const playersLabel = document.querySelector('#players');
  const ultimateLabel = document.querySelector('#ultimate');
  const ultimateFill = document.querySelector('#ultimate-fill');
  const ultimateName = document.querySelector('#ultimate-name');
  const abilityLabels = new Map(
    [...document.querySelectorAll('[data-ability]')].map((element) => [element.dataset.ability, element]),
  );
  const bombAlert = document.querySelector('#bomb-alert');
  const bombTitle = document.querySelector('#bomb-title');
  const bombDetail = document.querySelector('#bomb-detail');
  const bombProgress = document.querySelector('#bomb-progress');
  const fpsCounter = document.querySelector('#fps-counter');
  const hitmarker = document.querySelector('#hitmarker');
  const flashOverlay = document.querySelector('#flash-overlay');
  const orientationWarning = document.querySelector('#orientation-warning');
  const touchStick = document.querySelector('.touch-stick');
  const stickKnob = document.querySelector('.stick-knob');
  const crouchButton = document.querySelector('.touch-crouch');
  const bombButton = document.querySelector('.touch-bomb');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioFor(settings.neonQuality)));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101820);
  const mapDefinition = getMapDefinition(mapId);
  const { colliders } = createMap(scene, mapId);
  const camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.rotation.order = 'YXZ';
  scene.add(camera);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    bloomStrengthFor(settings.neonQuality),
    0.55,
    0.72,
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const timer = new THREE.Timer();
  timer.connect(document);
  const keys = new Set();
  const activeTouches = new Map();
  const touchMove = { x: 0, y: 0 };
  const remotePlayers = new Map();
  const worldEntities = new Map();
  const dynamicWalls = new Map();
  const pendingShotTracers = new Map();
  const localPosition = new THREE.Vector3();
  const localServerPosition = new THREE.Vector3();
  const localShield = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 1.85, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xff1e56,
      emissive: 0x9b0c2e,
      emissiveIntensity: 2.3,
      transparent: true,
      opacity: 0.36,
      roughness: 0.24,
      metalness: 0.24,
    }),
  );
  localShield.visible = false;
  scene.add(localShield);

  let yaw = 0;
  let pitch = 0;
  let health = 100;
  let ultimate = 0;
  let cooldowns = {};
  let fury = false;
  let barutchoBoost = false;
  let zorbaoStorm = false;
  let thermalShield = false;
  let slowed = false;
  let shieldActive = false;
  let initialized = false;
  let firing = false;
  let nextInputAt = 0;
  let nextShotAt = 0;
  let shotId = 0;
  let localY = 0;
  let verticalVelocity = 0;
  let grounded = true;
  let jumpWasPressed = false;
  let crouching = false;
  let touchCrouched = false;
  let aimDisrupted = false;
  let currentAgent = 'kaneca';
  let currentTeam = 'attackers';
  let spikeState = null;
  let spikeMesh = null;
  let dashFovStartedAt = null;
  let alive = true;
  let disposed = false;
  let fpsFrames = 0;
  let fpsWindowStarted = performance.now();
  let hitmarkerTimeout = 0;
  let mouseSensitivity = settings.sensitivity;
  let invertY = settings.invertY;
  let baseFov = settings.fov;

  const socketHandlers = [];
  const domHandlers = [];
  const windowHandlers = [];
  const timeouts = new Set();
  let flashTimeout = 0;
  function later(callback, delay) {
    const timeout = window.setTimeout(() => {
      timeouts.delete(timeout);
      if (!disposed) callback();
    }, delay);
    timeouts.add(timeout);
    return timeout;
  }

  function onSocket(event, handler) {
    socket.on(event, handler);
    socketHandlers.push([event, handler]);
  }
  function onDom(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    domHandlers.push([target, event, handler, options]);
  }
  function onWindow(event, handler) {
    window.addEventListener(event, handler);
    windowHandlers.push([event, handler]);
  }

  function createRemotePlayer(id, agent) {
    const Character = {
      satoro: SatoroBozo,
      barutcho: Barutcho,
      zorbao: Zorbao,
    }[agent] ?? CrimsonStalker;
    const character = new Character(scene, id);
    const remote = {
      character,
      group: character.group,
      target: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      yaw: 0,
      receivedState: false,
    };
    remotePlayers.set(id, remote);
    return remote;
  }

  function createTracer(from, end, color) {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 3,
      roughness: 0.25,
    });
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.LineCurve3(from, end), 1, 0.022, 5, false),
      material,
    );
    scene.add(mesh);
    return mesh;
  }

  function removeMesh(mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
  }

  function disposeWorldObject(object) {
    scene.remove(object);
    const geometries = new Set();
    const materials = new Set();
    object.traverse?.((child) => {
      if (child.geometry) geometries.add(child.geometry);
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        if (material) materials.add(material);
      }
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }

  function removeWorldEntity(id) {
    const entity = worldEntities.get(id);
    if (!entity) return;
    if (entity.timeout) {
      window.clearTimeout(entity.timeout);
      timeouts.delete(entity.timeout);
    }
    entity.dispose?.();
    if (!entity.dispose) disposeWorldObject(entity.object);
    if (id.startsWith('wall:')) dynamicWalls.delete(id.slice('wall:'.length));
    worldEntities.delete(id);
  }

  function addWorldEntity(id, object, duration, dispose) {
    removeWorldEntity(id);
    scene.add(object);
    const entity = { object, dispose, timeout: 0 };
    worldEntities.set(id, entity);
    if (duration > 0) {
      entity.timeout = later(() => removeWorldEntity(id), duration);
    }
    return entity;
  }

  function clearWorldEntities() {
    for (const id of worldEntities.keys()) removeWorldEntity(id);
    if (flashTimeout) {
      window.clearTimeout(flashTimeout);
      timeouts.delete(flashTimeout);
      flashTimeout = 0;
    }
    flashOverlay.classList.remove('visible');
    hud.classList.remove('thermal-shield');
  }

  function predictedShotEnd(origin, direction) {
    let distance = SHOT_RANGE;
    const point = new THREE.Vector3();
    const ray = new THREE.Ray(origin.clone(), direction.clone());
    for (const box of colliders) {
      const intersection = ray.intersectBox(box, point);
      if (intersection) distance = Math.min(distance, origin.distanceTo(intersection));
    }
    const caster = new THREE.Raycaster(origin, direction, 0, distance);
    const hits = caster.intersectObjects(
      [...remotePlayers.values()].filter(({ group }) => group.visible).map(({ group }) => group),
      true,
    );
    if (hits.length) distance = Math.min(distance, hits[0].distance);
    return origin.clone().addScaledVector(direction, distance);
  }

  function fireShot() {
    const id = ++shotId;
    const origin = camera.position.clone();
    const direction = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const tracer = createTracer(origin, predictedShotEnd(origin, direction), 0xffe19a);
    pendingShotTracers.set(id, tracer);
    later(() => {
      if (pendingShotTracers.get(id) !== tracer) return;
      pendingShotTracers.delete(id);
      removeMesh(tracer);
    }, 140);
    socket.emit('player:shoot', { shotId: id });
  }

  function showShot(shot) {
    const from = new THREE.Vector3(shot.from.x, shot.from.y, shot.from.z);
    const end = new THREE.Vector3(shot.hitPoint.x, shot.hitPoint.y, shot.hitPoint.z);
    const pending = shot.shooterId === localId ? pendingShotTracers.get(shot.shotId) : null;
    if (pending) {
      const geometry = new THREE.TubeGeometry(new THREE.LineCurve3(from, end), 1, 0.022, 5, false);
      pending.geometry.dispose();
      pending.geometry = geometry;
      return;
    }
    const tracer = createTracer(from, end, 0xff315f);
    later(() => removeMesh(tracer), 120);
  }

  function showDashFov() {
    dashFovStartedAt = performance.now();
  }

  function isGameplayInputActive() {
    return settings.mobileControls
      ? matchScreen.classList.contains('hidden')
      : document.pointerLockElement === canvas;
  }

  function updateOrientationWarning() {
    const portrait = window.innerHeight > window.innerWidth;
    orientationWarning.classList.toggle(
      'hidden',
      !settings.mobileControls || !hud.classList.contains('playing') || !portrait,
    );
  }

  function getMovement() {
    const moveX = THREE.MathUtils.clamp(
      Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + touchMove.x,
      -1,
      1,
    );
    const moveY = THREE.MathUtils.clamp(
      Number(keys.has('KeyW')) - Number(keys.has('KeyS')) - touchMove.y,
      -1,
      1,
    );
    return {
      forward: moveY > 0.05,
      backward: moveY < -0.05,
      left: moveX < -0.05,
      right: moveX > 0.05,
      moveX,
      moveY,
      crouch: keys.has('ControlLeft') || keys.has('ShiftLeft') || touchCrouched,
      jump: keys.has('Space'),
      interact: keys.has('KeyF'),
    };
  }

  function moveLocal(dt) {
    const movement = getMovement();
    crouching = movement.crouch;
    if (movement.jump && !jumpWasPressed && grounded && !crouching) {
      verticalVelocity = 7.2;
      grounded = false;
    }
    jumpWasPressed = movement.jump;
    if (!grounded) {
      verticalVelocity -= 20 * dt;
      localY = Math.max(0, localY + verticalVelocity * dt);
      if (localY === 0) {
        verticalVelocity = 0;
        grounded = true;
      }
    }

    const forwardAxis = movement.moveY;
    const strafeAxis = movement.moveX;
    const inputLength = Math.hypot(forwardAxis, strafeAxis);
    if (!inputLength) return;
    const moveStrength = Math.min(inputLength, 1);
    const speed = MOVE_SPEED
      * (slowed ? 0.65 : 1)
      * (crouching ? 0.6 : 1)
      * (fury ? 1.25 : 1)
      * (barutchoBoost ? 1.2 : 1);
    const dx = (forwardAxis / inputLength * Math.sin(yaw) + strafeAxis / inputLength * Math.cos(yaw)) * speed * dt * moveStrength;
    const dz = (-forwardAxis / inputLength * Math.cos(yaw) + strafeAxis / inputLength * Math.sin(yaw)) * speed * dt * moveStrength;
    const height = crouching ? 1.1 : 1.8;
    const blocked = (x, z) => colliders.some((box) => (
      box.max.y > localY && box.min.y < localY + height
      && x + PLAYER_RADIUS > box.min.x && x - PLAYER_RADIUS < box.max.x
      && z + PLAYER_RADIUS > box.min.z && z - PLAYER_RADIUS < box.max.z
    )) || [...dynamicWalls.values()].some((wall) => {
      if (wall.height <= localY || localY + height <= 0) return false;
      const dx = x - wall.position.x;
      const dz = z - wall.position.z;
      const rightX = Math.cos(wall.yaw);
      const rightZ = Math.sin(wall.yaw);
      const forwardX = Math.sin(wall.yaw);
      const forwardZ = -Math.cos(wall.yaw);
      const localX = dx * rightX + dz * rightZ;
      const localZ = dx * forwardX + dz * forwardZ;
      const nearestX = THREE.MathUtils.clamp(localX, -wall.halfWidth, wall.halfWidth);
      const nearestZ = THREE.MathUtils.clamp(localZ, -wall.halfDepth, wall.halfDepth);
      return (localX - nearestX) ** 2 + (localZ - nearestZ) ** 2 < PLAYER_RADIUS ** 2;
    });
    const moveAxis = (axis, amount) => {
      const steps = Math.max(1, Math.ceil(Math.abs(amount) / 0.12));
      for (let step = 0; step < steps; step += 1) {
        const arenaLimit = mapDefinition.size / 2 - 3;
        const next = THREE.MathUtils.clamp(localPosition[axis] + amount / steps, -arenaLimit, arenaLimit);
        const collision = axis === 'x' ? blocked(next, localPosition.z) : blocked(localPosition.x, next);
        if (collision) break;
        localPosition[axis] = next;
      }
    };
    moveAxis('x', dx);
    moveAxis('z', dz);
  }

  function updateInput(now) {
    if (now < nextInputAt || !socket.connected || !localId) return;
    nextInputAt = now + INPUT_INTERVAL;
    socket.emit('player:input', { ...getMovement(), yaw, pitch });
  }

  function updateFiring(now) {
    if (!firing || !socket.connected || !localId || shieldActive || !alive || !isGameplayInputActive()) return;
    if (now < nextShotAt) return;
    fireShot();
    nextShotAt = now + (fury ? FIRE_INTERVAL / 1.2 : FIRE_INTERVAL);
  }

  function updateHud(state) {
    const me = state.find(({ id }) => id === localId);
    if (!me) return;
    health = me.health;
    healthLabel.textContent = String(Math.ceil(health));
    if (!initialized) {
      localPosition.set(me.position.x, me.y, me.position.z);
      localServerPosition.copy(localPosition);
      yaw = me.yaw;
      initialized = true;
    }
    ultimate = me.ultimate;
    ultimateLabel.textContent = `${ultimate}/7`;
    ultimateFill.style.width = `${ultimate / 7 * 100}%`;
    cooldowns = me.cooldowns;
    fury = me.fury;
    barutchoBoost = me.barutchoBoost;
    zorbaoStorm = me.zorbaoStorm;
    thermalShield = me.bonusShield.active;
    hud.classList.toggle('thermal-shield', thermalShield);
    slowed = me.slowed;
    shieldActive = me.shield.active;
    alive = me.alive;
    localShield.visible = shieldActive;
    currentAgent = me.agent;
    currentTeam = me.team;
    aimDisrupted = me.aimDisrupted;

    const labels = AGENT_ABILITY_LABELS[currentAgent] ?? AGENT_ABILITY_LABELS.kaneca;
    const shortLabels = AGENT_ABILITY_SHORT_LABELS[currentAgent] ?? AGENT_ABILITY_SHORT_LABELS.kaneca;
    const abilities = AGENT_ABILITY_KEYS[currentAgent] ?? AGENT_ABILITY_KEYS.kaneca;
    ultimateName.textContent = labels.ultimate;
    for (const [slot, element] of abilityLabels) {
      const ability = abilities[{ dash: 'KeyC', whip: 'KeyQ', shield: 'KeyE', fury: 'KeyX' }[slot]];
      const name = labels[ability];
      element.querySelector('span').textContent = shortLabels[ability] ?? name;
      const cooldown = cooldowns[ability] ?? 0;
      element.classList.toggle('ready', cooldown === 0 && (slot !== 'fury' || ultimate >= 7));
      element.classList.toggle(
        'active',
        slot === 'fury'
          ? fury || zorbaoStorm
          : slot === 'shield' && (shieldActive || thermalShield),
      );
      element.querySelector('.cooldown').textContent = cooldown > 0
        ? `${(cooldown / 1000).toFixed(1)}s`
        : slot === 'fury' && ultimate < 7 ? `${ultimate}/7` : '';
    }
    updateBombHud();
  }

  function updateBombHud() {
    const activeSpike = spikeState && !['resolved', 'inactive'].includes(spikeState.phase);
    const localHasBomb = activeSpike && spikeState.carrierId === localId && spikeState.phase === 'carried';
    const nearSite = Object.values(mapDefinition.sites).some((site) => (
      Math.hypot(localPosition.x - site.x, localPosition.z - site.z) <= 9
    ));
    const spikeDistance = spikeState?.position
      ? Math.hypot(localPosition.x - spikeState.position.x, localPosition.z - spikeState.position.z)
      : Infinity;
    const canInteract = activeSpike && (
      (localHasBomb && nearSite)
      || (spikeState.phase === 'dropped' && currentTeam === 'attackers' && spikeDistance <= 2.2)
      || (spikeState.phase === 'planted' && currentTeam === 'defenders' && spikeDistance <= 2.8)
    );
    bombButton.classList.toggle('available', Boolean(canInteract));
    bombButton.classList.toggle('unavailable', !canInteract);
    bombButton.setAttribute('aria-label', canInteract ? 'Segure para interagir com a bomba' : 'Bomba fora de alcance');

    if (!activeSpike) {
      bombAlert.classList.add('hidden');
      bombAlert.classList.remove('urgent');
      return;
    }
    bombAlert.classList.remove('hidden');
    bombAlert.classList.toggle('urgent', spikeState.phase === 'planted');
    const plantProgress = spikeState.plantProgressMs ?? 0;
    const defuseProgress = spikeState.defuseProgressMs ?? 0;
    if (localHasBomb) {
      bombTitle.textContent = 'VOCÊ ESTÁ COM A BOMBA (Segure F no Bombsite para plantar)';
      bombDetail.textContent = spikeState.plantingId === localId
        ? `Plantando ${(plantProgress / 1000).toFixed(1)} / 3.0 s`
        : 'Bombsite A ou B';
      bombProgress.max = 3000;
      bombProgress.value = spikeState.plantingId === localId ? plantProgress : 0;
    } else if (spikeState.phase === 'planted') {
      const seconds = Math.max(0, (spikeState.remainingMs ?? 0) / 1000).toFixed(1);
      bombTitle.textContent = `BOMBA PLANTADA — ${spikeState.site}`;
      bombDetail.textContent = currentTeam === 'defenders'
        ? spikeState.defuserId === localId
          ? `Desarmando ${(defuseProgress / 1000).toFixed(1)} / 4.0 s · ${seconds}s`
          : `Segure F perto da bomba para desarmar · ${seconds}s`
        : `Detona em ${seconds}s`;
      bombProgress.max = 4000;
      bombProgress.value = currentTeam === 'defenders' && spikeState.defuserId === localId ? defuseProgress : 0;
    } else if (spikeState.phase === 'dropped') {
      bombTitle.textContent = currentTeam === 'attackers' ? 'BOMBA SOLTA — Segure F para recolher' : 'BOMBA SOLTA';
      bombDetail.textContent = 'A bomba ainda não foi plantada';
      bombProgress.max = 100;
      bombProgress.value = 0;
    } else {
      bombTitle.textContent = `BOMBA — ${spikeState.carrierNickname ?? 'Atacante'}`;
      bombDetail.textContent = currentTeam === 'attackers' ? 'Leve a bomba ao Bombsite A ou B' : 'Impeça o plantio';
      bombProgress.max = 3000;
      bombProgress.value = 0;
    }
  }

  function updateSpikeVisual(state) {
    spikeState = state;
    const visible = state && ['planted', 'dropped'].includes(state.phase) && state.position;
    if (!visible) {
      if (spikeMesh) removeMesh(spikeMesh);
      spikeMesh = null;
    } else if (!spikeMesh) {
      const material = new THREE.MeshStandardMaterial({
        color: state.phase === 'planted' ? 0xff315f : 0x5beaff,
        emissive: state.phase === 'planted' ? 0xff174b : 0x19bfff,
        emissiveIntensity: 3.5,
        metalness: 0.55,
        roughness: 0.25,
      });
      spikeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.38, 6), material);
      scene.add(spikeMesh);
    }
    if (spikeMesh && visible) {
      spikeMesh.position.set(state.position.x, state.position.y + 0.23, state.position.z);
      const planted = state.phase === 'planted';
      spikeMesh.material.color.setHex(planted ? 0xff315f : 0x5beaff);
      spikeMesh.material.emissive.setHex(planted ? 0xff174b : 0x19bfff);
      const pulse = planted ? 0.25 + 0.75 * Math.abs(Math.sin(performance.now() * 0.012)) : 0.7;
      spikeMesh.material.emissiveIntensity = planted ? 1.3 + pulse * 4 : 2;
      spikeMesh.rotation.y += planted ? 0.035 : 0.01;
    }
    updateBombHud();
  }

  function showDashEffect(start, end) {
    showDashTrail(start, end);
    showDashFov();
  }

  function showDashTrail(start, end, palette = [0xff244d, 0x17141c]) {
    const from = new THREE.Vector3(start.x, 0.7, start.z);
    const to = new THREE.Vector3(end.x, 0.7, end.z);
    const direction = to.clone().sub(from);
    if (direction.lengthSq() < 0.01) return;
    direction.normalize();
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    for (let index = 0; index < 8; index += 1) {
      const point = to.clone()
        .addScaledVector(direction, -index * 1.15)
        .addScaledVector(side, (index - 3.5) * 0.16);
      point.y += (index % 3) * 0.22;
      const endPoint = point.clone()
        .addScaledVector(direction, -0.9 - (index % 2) * 0.45)
        .addScaledVector(side, -0.28);
      const streak = createTracer(point, endPoint, palette[index % palette.length]);
      later(() => removeMesh(streak), 260);
    }
  }

  function showGravityEffect(point) {
    if (!point) return;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 12, 8),
      new THREE.MeshStandardMaterial({
        color: 0x38bfff,
        emissive: 0x168dff,
        emissiveIntensity: 3,
        transparent: true,
        opacity: 0.68,
        wireframe: true,
      }),
    );
    mesh.position.set(point.x, point.y, point.z);
    scene.add(mesh);
    later(() => removeMesh(mesh), 2_000);
  }

  function showRepulseEffect(position, color = 0xff244d) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.09, 6, 24),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 2.4,
        transparent: true,
        opacity: 0.85,
      }),
    );
    ring.position.set(position.x, 0.35, position.z);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);
    later(() => removeMesh(ring), 420);
  }

  function showVoidEffect(origin, direction) {
    if (!origin || !direction) return;
    const from = new THREE.Vector3(origin.x, origin.y, origin.z);
    const to = from.clone().add(new THREE.Vector3(direction.x, direction.y, direction.z).multiplyScalar(100));
    const beam = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.LineCurve3(from, to), 12, 0.16, 6, false),
      new THREE.MeshBasicMaterial({ color: 0xc13cff }),
    );
    scene.add(beam);
    later(() => removeMesh(beam), 450);
  }

  function showSonarEffect(point) {
    if (!point) return;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(10, 0.055, 5, 48),
      new THREE.MeshBasicMaterial({ color: 0x53dcff, transparent: true, opacity: 0.62 }),
    );
    ring.position.set(point.x, 0.12, point.z);
    ring.rotation.x = Math.PI / 2;
    addWorldEntity(`sonar:${Date.now()}:${Math.random()}`, ring, 650);
  }

  function showFlashEffect(point) {
    if (!point) return;
    const orb = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.28, 1),
      new THREE.MeshStandardMaterial({
        color: 0xffd17d,
        emissive: 0xffa52f,
        emissiveIntensity: 3.2,
        roughness: 0.2,
      }),
    );
    orb.position.set(point.x, point.y, point.z);
    addWorldEntity(`flash:${Date.now()}:${Math.random()}`, orb, 500);
  }

  function showSonicBeam(origin, end) {
    if (!origin || !end) return;
    const from = new THREE.Vector3(origin.x, origin.y, origin.z);
    const to = new THREE.Vector3(end.x, end.y, end.z);
    const beam = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.LineCurve3(from, to), 18, 0.12, 6, false),
      new THREE.MeshStandardMaterial({
        color: 0xffd15e,
        emissive: 0xffae24,
        emissiveIntensity: 3.3,
        roughness: 0.18,
      }),
    );
    addWorldEntity(`sonic:${Date.now()}:${Math.random()}`, beam, 400);
  }

  function showIceWall(wall) {
    if (!wall) return;
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0x8be7ff,
      emissive: 0x248bb9,
      emissiveIntensity: 2,
      transparent: true,
      opacity: 0.68,
      roughness: 0.22,
      metalness: 0.22,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(wall.halfWidth * 2, wall.height, wall.halfDepth * 2),
      material,
    );
    mesh.position.y = wall.height / 2;
    group.add(mesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xc3f5ff, transparent: true, opacity: 0.9 }),
    );
    edges.position.copy(mesh.position);
    group.add(edges);
    group.position.set(wall.position.x, wall.position.y ?? 0, wall.position.z);
    group.rotation.y = -wall.yaw;
    group.userData.material = material;
    group.userData.health = wall.health;
    addWorldEntity(`wall:${wall.id}`, group, wall.expiresAt - Date.now());
    dynamicWalls.set(wall.id, wall);
  }

  function updateWallDamage({ id, health: remainingHealth, destroyed }) {
    const entity = worldEntities.get(`wall:${id}`);
    if (!entity) return;
    if (destroyed) {
      removeWorldEntity(`wall:${id}`);
      return;
    }
    entity.object.userData.health = remainingHealth;
    entity.object.userData.material.opacity = 0.25 + 0.43 * remainingHealth / 200;
  }

  function showIceField(field) {
    if (!field) return;
    const group = new THREE.Group();
    const ice = new THREE.Mesh(
      new THREE.CircleGeometry(field.radius, 36),
      new THREE.MeshStandardMaterial({
        color: 0x83dcff,
        emissive: 0x267ca8,
        emissiveIntensity: 1.2,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ice.rotation.x = -Math.PI / 2;
    ice.position.y = 0.04;
    group.add(ice);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(field.radius, 0.06, 5, 36),
      new THREE.MeshBasicMaterial({ color: 0x9beaff, transparent: true, opacity: 0.74 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.11;
    group.add(ring);
    group.position.set(field.position.x, field.position.y ?? 0, field.position.z);
    addWorldEntity(`ice-field:${field.id}`, group, field.expiresAt - Date.now());
  }

  function showStorm(storm) {
    if (!storm) return;
    const group = new THREE.Group();
    const outerRing = new THREE.Mesh(
      new THREE.TorusGeometry(storm.radius, 0.08, 6, 48),
      new THREE.MeshStandardMaterial({
        color: 0x9defff,
        emissive: 0x55caff,
        emissiveIntensity: 2,
        transparent: true,
        opacity: 0.56,
      }),
    );
    outerRing.rotation.x = Math.PI / 2;
    outerRing.position.y = 0.16;
    group.add(outerRing);
    const innerRing = new THREE.Mesh(
      new THREE.TorusGeometry(storm.radius * 0.72, 0.045, 5, 40),
      new THREE.MeshBasicMaterial({ color: 0xd7faff, transparent: true, opacity: 0.38 }),
    );
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.2;
    group.add(innerRing);
    for (let index = 0; index < 14; index += 1) {
      const shard = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28 + index % 3 * 0.07, 0),
        new THREE.MeshStandardMaterial({
          color: 0xa2edff,
          emissive: 0x3aa9d0,
          emissiveIntensity: 1.8,
          transparent: true,
          opacity: 0.64,
        }),
      );
      const angle = index / 14 * Math.PI * 2;
      shard.position.set(Math.cos(angle) * storm.radius * 0.88, 0.8 + index % 4 * 0.48, Math.sin(angle) * storm.radius * 0.88);
      shard.rotation.set(angle, angle * 0.7, angle * 0.4);
      group.add(shard);
    }
    group.position.set(storm.position.x, storm.position.y ?? 0, storm.position.z);
    group.userData.spinRate = 0.22;
    addWorldEntity(`storm:${storm.id}`, group, storm.expiresAt - Date.now());
  }

  function showRevealEffect({ playerId, position, durationMs, color = 'red' }) {
    if (!position || durationMs <= 0) return;
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.32, 3.2, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: color === 'cyan' ? 0x4fe9ff : 0xff294f,
        transparent: true,
        opacity: 0.78,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    marker.position.set(position.x, position.y + 1.7, position.z);
    marker.renderOrder = 10;
    addWorldEntity(`reveal:${playerId}:${Date.now()}:${Math.random()}`, marker, durationMs);
  }

  function showFlashOverlay(durationMs) {
    if (flashTimeout) {
      window.clearTimeout(flashTimeout);
      timeouts.delete(flashTimeout);
    }
    flashOverlay.classList.add('visible');
    flashTimeout = later(() => {
      flashTimeout = 0;
      flashOverlay.classList.remove('visible');
    }, durationMs);
  }

  function showWorldAbilityEffect(effect) {
    if (effect.ability === 'sonar') showSonarEffect(effect.point);
    if (effect.ability === 'flash') showFlashEffect(effect.point);
    if (effect.ability === 'propel' && effect.dash) {
      showDashTrail(effect.dash.start, effect.dash.end, [0x58ddff, 0xffc247]);
    }
    if (effect.ability === 'sonic') showSonicBeam(effect.origin, effect.end);
    if (effect.wall) showIceWall(effect.wall);
    if (effect.field) showIceField(effect.field);
    if (effect.storm) showStorm(effect.storm);
  }

  function showLocalAbility(effect) {
    if (effect.ability === 'dash') showDashEffect(effect.dash.start, effect.dash.end);
    if (effect.ability === 'teleport' && effect.teleport?.end) {
      localPosition.set(effect.teleport.end.x, localY, effect.teleport.end.z);
      localServerPosition.copy(localPosition);
      showRepulseEffect(effect.teleport.end, 0x31c8ff);
    }
    if (effect.ability === 'gravity') showGravityEffect(effect.point);
    if (effect.ability === 'repulse') showRepulseEffect(localPosition);
    if (effect.ability === 'void') showVoidEffect(effect.origin, effect.direction);
    if (effect.ability === 'whip') {
      const direction = camera.getWorldDirection(new THREE.Vector3());
      const end = camera.position.clone().addScaledVector(direction, effect.fury ? 4.5 : 10);
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([camera.position.clone(), end]),
        new THREE.LineBasicMaterial({ color: 0xff244d }),
      );
      scene.add(line);
      later(() => {
        scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
      }, 220);
    }
    if (effect.ability === 'void' && effect.charging) {
      const charge = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xb834ff, transparent: true, opacity: 0.55, wireframe: true }),
      );
      camera.add(charge);
      charge.position.set(0, -0.15, -1.2);
      later(() => {
        camera.remove(charge);
        charge.geometry.dispose();
        charge.material.dispose();
      }, 1_000);
    }
  }

  function onGameState(players) {
    playersLabel.textContent = `${players.length} jogadores`;
    const ids = new Set(players.map(({ id }) => id));
    for (const [id, remote] of remotePlayers) {
      if (ids.has(id)) continue;
      remote.character.dispose();
      remotePlayers.delete(id);
    }
    for (const state of players) {
      if (state.id === localId) {
        localServerPosition.set(state.position.x, state.y, state.position.z);
        const correction = localPosition.distanceTo(localServerPosition);
        if (!initialized || correction > 2) localPosition.copy(localServerPosition);
        else localPosition.lerp(localServerPosition, 0.2);
        localY = state.y;
        crouching = state.isCrouching;
        health = state.health;
        healthLabel.textContent = String(Math.ceil(health));
        continue;
      }
      let remote = remotePlayers.get(state.id);
      const wrongAgent = remote && remote.character.agent !== state.agent;
      if (wrongAgent) {
        remote.character.dispose();
        remotePlayers.delete(state.id);
        remote = null;
      }
      remote ??= createRemotePlayer(state.id, state.agent);
      remote.target.set(state.position.x, state.y, state.position.z);
      if (!remote.receivedState) {
        remote.group.position.copy(remote.target);
        remote.previousPosition.copy(remote.target);
        remote.receivedState = true;
      }
      remote.yaw = state.yaw;
      remote.group.visible = state.alive;
      remote.character.setFury?.(state.fury);
      remote.character.setShield?.(state.shield.active);
      remote.character.setBoost?.(state.barutchoBoost);
      remote.character.setThermalShield?.(state.bonusShield.active);
      remote.character.setStorm?.(state.zorbaoStorm);
      remote.character.setCrouching?.(state.isCrouching);
    }
    updateHud(players);
  }

  function onPlayerHit({ id, attackerId, health: remainingHealth, ultimate: charge, isHeadshot }) {
    if (id === localId && remainingHealth !== undefined) healthLabel.textContent = String(Math.ceil(remainingHealth));
    if (attackerId === localId) {
      hitmarker.classList.toggle('headshot', isHeadshot === true);
      hitmarker.classList.add('visible');
      window.clearTimeout(hitmarkerTimeout);
      hitmarkerTimeout = later(() => hitmarker.classList.remove('visible'), 150);
    }
    if (attackerId === localId && Number.isFinite(charge)) {
      ultimate = charge;
      ultimateLabel.textContent = `${ultimate}/7`;
      ultimateFill.style.width = `${ultimate / 7 * 100}%`;
    }
  }

  function onAbilityEffect(effect) {
    showWorldAbilityEffect(effect);
    if (effect.playerId === localId) {
      showLocalAbility(effect);
      return;
    }
    const remote = remotePlayers.get(effect.playerId);
    if (remote && effect.ability === 'whip') remote.character.showWhip?.(effect.fury);
    if (remote && effect.ability === 'dash') remote.character.showDash?.();
    if (remote && effect.ability === 'fury') remote.character.setFury?.(true);
    if (remote && effect.ability === 'thermal') remote.character.setThermalShield?.(true);
    if (remote && effect.ability === 'storm') remote.character.setStorm?.(true);
    if (remote && effect.ability === 'teleport' && effect.teleport?.end) {
      remote.target.set(effect.teleport.end.x, remote.target.y, effect.teleport.end.z);
    }
    if (effect.ability === 'gravity') showGravityEffect(effect.point);
    if (effect.ability === 'repulse' && remote) showRepulseEffect(remote.group.position);
    if (effect.ability === 'void') showVoidEffect(effect.origin, effect.direction);
  }

  function onShotRejected({ shotId: rejectedId }) {
    const tracer = pendingShotTracers.get(rejectedId);
    if (!tracer) return;
    pendingShotTracers.delete(rejectedId);
    removeMesh(tracer);
  }

  function onPlayerFlashed({ durationMs }) {
    if (Number.isFinite(durationMs) && durationMs > 0) showFlashOverlay(durationMs);
  }

  function onPointerLockChange() {
    if (document.pointerLockElement !== canvas) {
      keys.clear();
      firing = false;
      jumpWasPressed = false;
    }
  }

  function activateAbility(code) {
    const abilities = AGENT_ABILITY_KEYS[currentAgent] ?? AGENT_ABILITY_KEYS.kaneca;
    if (abilities[code] && isGameplayInputActive() && socket.connected) {
      socket.emit('player:ability', abilities[code]);
    }
  }

  function onMouseMove(event) {
    if (document.pointerLockElement !== canvas) return;
    yaw += event.movementX * mouseSensitivity;
    const ySign = invertY ? 1 : -1;
    pitch = THREE.MathUtils.clamp(pitch + event.movementY * mouseSensitivity * ySign, -1.45, 1.45);
  }

  function onKeyDown(event) {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(event.code)) event.preventDefault();
    if (!isGameplayInputActive()) return;
    if (!event.repeat) activateAbility(event.code);
    keys.add(event.code);
  }

  function onKeyUp(event) {
    keys.delete(event.code);
  }

  function onMouseDown(event) {
    if (event.button !== 0 || settings.mobileControls || document.pointerLockElement !== canvas || !socket.connected || shieldActive) return;
    firing = true;
    updateFiring(performance.now());
  }

  function onMouseUp(event) {
    if (event.button === 0) firing = false;
  }

  function onBlur() {
    keys.clear();
    firing = false;
    activeTouches.clear();
    touchMove.x = 0;
    touchMove.y = 0;
    stickKnob.style.left = '50%';
    stickKnob.style.top = '50%';
    touchStick.classList.remove('active');
    document.querySelectorAll('.touch-button.pressed').forEach((button) => button.classList.remove('pressed'));
    jumpWasPressed = false;
  }

  function updateTouchStick(touch) {
    const rect = touchStick.getBoundingClientRect();
    const radius = 46;
    const dx = (touch.clientX - (rect.left + rect.width / 2)) / radius;
    const dy = (touch.clientY - (rect.top + rect.height / 2)) / radius;
    const rawMagnitude = Math.hypot(dx, dy);
    const magnitude = Math.min(rawMagnitude, 1);
    if (magnitude <= 0.12) {
      touchMove.x = 0;
      touchMove.y = 0;
      stickKnob.style.left = '50%';
      stickKnob.style.top = '50%';
      return;
    }
    const scaled = (magnitude - 0.12) / 0.88;
    touchMove.x = dx / magnitude * scaled;
    touchMove.y = dy / magnitude * scaled;
    stickKnob.style.left = `calc(50% + ${dx / rawMagnitude * radius * magnitude}px)`;
    stickKnob.style.top = `calc(50% + ${dy / rawMagnitude * radius * magnitude}px)`;
  }

  function applyTouchAim(touch, contact) {
    const dx = touch.clientX - contact.lastX;
    const dy = touch.clientY - contact.lastY;
    yaw += dx * mouseSensitivity;
    const ySign = invertY ? 1 : -1;
    pitch = THREE.MathUtils.clamp(pitch + dy * mouseSensitivity * ySign, -1.45, 1.45);
    contact.lastX = touch.clientX;
    contact.lastY = touch.clientY;
  }

  function onTouchStart(event) {
    if (!settings.mobileControls || !isGameplayInputActive()) return;
    let handled = false;
    for (const touch of event.changedTouches) {
      const touchTarget = touch.target instanceof Element ? touch.target : event.target;
      const target = touchTarget instanceof Element
        ? touchTarget.closest('[data-touch-control]')
        : null;
      const control = target?.dataset.touchControl;
      if (control === 'move') {
        activeTouches.set(touch.identifier, { role: 'move' });
        touchStick.classList.add('active');
        updateTouchStick(touch);
      } else if (control === 'fire') {
        activeTouches.set(touch.identifier, { role: 'fire', lastX: touch.clientX, lastY: touch.clientY });
        target.classList.add('pressed');
        firing = true;
        updateFiring(performance.now());
      } else if (control === 'jump') {
        activeTouches.set(touch.identifier, { role: 'jump', target });
        keys.add('Space');
        target.classList.add('pressed');
      } else if (control === 'crouch') {
        activeTouches.set(touch.identifier, { role: 'crouch', target });
        touchCrouched = !touchCrouched;
        target.setAttribute('aria-pressed', String(touchCrouched));
      } else if (control === 'bomb') {
        activeTouches.set(touch.identifier, { role: 'bomb', target });
        keys.add('KeyF');
        target.classList.add('pressed');
      } else if (control?.startsWith('ability-')) {
        activeTouches.set(touch.identifier, { role: 'ability' });
        activateAbility(`Key${control.slice(-1).toUpperCase()}`);
      } else if (touch.clientX >= window.innerWidth / 2) {
        activeTouches.set(touch.identifier, {
          role: 'aim',
          lastX: touch.clientX,
          lastY: touch.clientY,
        });
      } else {
        continue;
      }
      handled = true;
    }
    if (handled) event.preventDefault();
  }

  function onTouchMove(event) {
    let handled = false;
    for (const touch of event.changedTouches) {
      const contact = activeTouches.get(touch.identifier);
      if (!contact) continue;
      handled = true;
      if (contact.role === 'move') updateTouchStick(touch);
      if (contact.role === 'aim' || contact.role === 'fire') applyTouchAim(touch, contact);
    }
    if (handled) event.preventDefault();
  }

  function onTouchEnd(event) {
    let handled = false;
    for (const touch of event.changedTouches) {
      const contact = activeTouches.get(touch.identifier);
      if (!contact) continue;
      handled = true;
      activeTouches.delete(touch.identifier);
      if (contact.role === 'move') {
        touchMove.x = 0;
        touchMove.y = 0;
        stickKnob.style.left = '50%';
        stickKnob.style.top = '50%';
        touchStick.classList.remove('active');
      } else if (contact.role === 'jump') {
        keys.delete('Space');
        contact.target.classList.remove('pressed');
      } else if (contact.role === 'bomb') {
        keys.delete('KeyF');
        contact.target.classList.remove('pressed');
      } else if (contact.role === 'fire') {
        contact.target.classList.remove('pressed');
        firing = [...activeTouches.values()].some(({ role }) => role === 'fire');
      }
    }
    if (handled) event.preventDefault();
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    updateOrientationWarning();
  }

  function renderFrame() {
    if (disposed) return;
    timer.update();
    const dt = Math.min(Math.max(timer.getDelta(), 0), 0.1);
    if (!isGameplayInputActive() && (keys.size || firing || activeTouches.size || touchMove.x || touchMove.y)) {
      onBlur();
    }
    moveLocal(dt);
    const now = performance.now();
    updateInput(now);
    updateFiring(now);
    localPosition.y = localY;
    camera.position.set(localPosition.x, localY + (crouching ? 0.98 : 1.62), localPosition.z);
    const shake = aimDisrupted ? Math.sin(now * 0.025) * 0.018 : 0;
    camera.rotation.set(pitch + shake, -yaw + shake, 0, 'YXZ');
    const forward = new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
    localShield.position.set(
      localPosition.x + forward.x * 0.95,
      localY + 1,
      localPosition.z + forward.z * 0.95,
    );
    localShield.rotation.y = -yaw;

    for (const remote of remotePlayers.values()) {
      remote.previousPosition.copy(remote.group.position);
      remote.group.position.lerp(remote.target, 1 - Math.exp(-12 * dt));
      remote.group.rotation.y = -remote.yaw;
      const speed = dt > 0 ? remote.group.position.distanceTo(remote.previousPosition) / dt : 0;
      remote.character.setMoveSpeed?.(speed);
      remote.character.update?.(now / 1000);
    }
    for (const { object } of worldEntities.values()) {
      if (object.userData.spinRate) object.rotation.y += object.userData.spinRate * dt;
    }
    if (dashFovStartedAt !== null) {
      const progress = THREE.MathUtils.clamp((now - dashFovStartedAt) / DASH_FOV_DURATION, 0, 1);
      camera.fov = baseFov + 15 * Math.sin(Math.PI * progress);
      camera.updateProjectionMatrix();
      if (progress === 1) dashFovStartedAt = null;
    }
    if (spikeMesh) updateSpikeVisual(spikeState);
    if (settings.showFps) {
      fpsFrames += 1;
      if (now - fpsWindowStarted >= 500) {
        fpsCounter.textContent = `${Math.round(fpsFrames * 1000 / (now - fpsWindowStarted))} FPS`;
        fpsWindowStarted = now;
        fpsFrames = 0;
      }
    }
    composer.render(dt);
  }

  onSocket('game:state', onGameState);
  onSocket('player:shot', showShot);
  onSocket('player:shot-rejected', onShotRejected);
  onSocket('player:hit', onPlayerHit);
  onSocket('player:ability-effect', onAbilityEffect);
  onSocket('player:revealed', showRevealEffect);
  onSocket('player:flashed', onPlayerFlashed);
  onSocket('world:wall-damaged', updateWallDamage);
  onSocket('spike:state', updateSpikeVisual);
  onDom(document, 'pointerlockchange', onPointerLockChange);
  onDom(document, 'mousemove', onMouseMove);
  onDom(document, 'keydown', onKeyDown);
  onDom(document, 'keyup', onKeyUp);
  onDom(document, 'mousedown', onMouseDown);
  onDom(document, 'mouseup', onMouseUp);
  onDom(document, 'touchstart', onTouchStart, { passive: false });
  onDom(document, 'touchmove', onTouchMove, { passive: false });
  onDom(document, 'touchend', onTouchEnd, { passive: false });
  onDom(document, 'touchcancel', onTouchEnd, { passive: false });
  onWindow('blur', onBlur);
  onWindow('resize', onResize);
  onWindow('orientationchange', updateOrientationWarning);

  renderer.setAnimationLoop(renderFrame);
  Object.assign(window, { renderer, scene, composer, bloomPass });
  hud.classList.add('playing');
  hud.classList.toggle('mobile-controls-enabled', settings.mobileControls);
  fpsCounter.classList.toggle('hidden', !settings.showFps);
  updateOrientationWarning();

  function updateSettings(next) {
    settings = { ...next };
    mouseSensitivity = settings.sensitivity;
    invertY = settings.invertY;
    baseFov = settings.fov;
    hud.classList.toggle('mobile-controls-enabled', settings.mobileControls);
    if (!settings.mobileControls) {
      activeTouches.clear();
      touchMove.x = 0;
      touchMove.y = 0;
      firing = false;
      touchCrouched = false;
      crouchButton.setAttribute('aria-pressed', 'false');
      stickKnob.style.left = '50%';
      stickKnob.style.top = '50%';
      touchStick.classList.remove('active');
      document.querySelectorAll('.touch-button.pressed').forEach((button) => button.classList.remove('pressed'));
    }
    updateOrientationWarning();
    camera.fov = baseFov;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioFor(settings.neonQuality)));
    composer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioFor(settings.neonQuality)));
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.strength = bloomStrengthFor(settings.neonQuality);
    fpsCounter.classList.toggle('hidden', !settings.showFps);
  }

  function roundStarted() {
    keys.clear();
    activeTouches.clear();
    touchMove.x = 0;
    touchMove.y = 0;
    touchCrouched = false;
    crouchButton.setAttribute('aria-pressed', 'false');
    stickKnob.style.left = '50%';
    stickKnob.style.top = '50%';
    touchStick.classList.remove('active');
    document.querySelectorAll('.touch-button.pressed').forEach((button) => button.classList.remove('pressed'));
    firing = false;
    initialized = false;
    localY = 0;
    verticalVelocity = 0;
    grounded = true;
    fury = false;
    barutchoBoost = false;
    zorbaoStorm = false;
    thermalShield = false;
    clearWorldEntities();
    spikeState = null;
    if (spikeMesh) removeMesh(spikeMesh);
    spikeMesh = null;
    updateBombHud();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    for (const [event, handler] of socketHandlers) socket.off(event, handler);
    for (const [target, event, handler, options] of domHandlers) target.removeEventListener(event, handler, options);
    for (const [event, handler] of windowHandlers) window.removeEventListener(event, handler);
    timer.dispose();
    for (const timeout of timeouts) window.clearTimeout(timeout);
    timeouts.clear();
    clearWorldEntities();
    for (const tracer of pendingShotTracers.values()) removeMesh(tracer);
    pendingShotTracers.clear();
    for (const remote of remotePlayers.values()) remote.character.dispose();
    remotePlayers.clear();
    if (spikeMesh) removeMesh(spikeMesh);
    scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material) continue;
        for (const value of Object.values(material)) {
          if (value?.isTexture) value.dispose();
        }
        material.dispose();
      }
    });
    composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    canvas.classList.remove('visible');
    hud.classList.remove('playing');
    orientationWarning.classList.add('hidden');
    bombAlert.classList.add('hidden');
    fpsCounter.classList.add('hidden');
    if (window.renderer === renderer) {
      delete window.renderer;
      delete window.scene;
      delete window.composer;
      delete window.bloomPass;
    }
    const replacementCanvas = document.createElement('canvas');
    replacementCanvas.id = canvas.id;
    replacementCanvas.className = canvas.className;
    replacementCanvas.setAttribute('aria-label', canvas.getAttribute('aria-label') ?? 'Cena da partida');
    canvas.replaceWith(replacementCanvas);
    onExit?.(replacementCanvas);
  }

  return { dispose, updateSettings, roundStarted };
}

function pixelRatioFor(quality) {
  return { low: 1, medium: 1.25, high: 1.5 }[quality] ?? 1.25;
}

function bloomStrengthFor(quality) {
  return { low: 0.55, medium: 1.05, high: 1.55 }[quality] ?? 1.05;
}
