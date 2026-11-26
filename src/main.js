import './style.css';
import { io } from 'socket.io-client';

function detectTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

const DEFAULT_SETTINGS = {
  sensitivity: 0.0022,
  neonQuality: 'medium',
  fov: 75,
  crosshairColor: 'green',
  crosshairSize: 14,
  invertY: false,
  showFps: false,
  mobileControls: detectTouchDevice(),
};
const CROSSHAIR_COLORS = {
  green: '#6bff72',
  cyan: '#00f0ff',
  red: '#ff315f',
  white: '#ffffff',
};
const AGENT_NAMES = {
  kaneca: 'Kaneca',
  satoro: 'Satoro Bozo',
  barutcho: 'Barutcho',
  zorbao: 'Zorbão',
};

let canvas = document.querySelector('#game');
const mainMenu = document.querySelector('#main-menu');
const lobbyScreen = document.querySelector('#lobby-screen');
const matchScreen = document.querySelector('#match-screen');
const resumeScreen = document.querySelector('#resume-screen');
const hud = document.querySelector('.hud');
const nicknameInput = document.querySelector('#nickname');
const joinForm = document.querySelector('#join-form');
const joinCodeInput = document.querySelector('#room-code-input');
const menuError = document.querySelector('#menu-error');
const lobbyError = document.querySelector('#lobby-error');
const roomCodeLabel = document.querySelector('#room-code');
const lobbyCount = document.querySelector('#lobby-count');
const mapSelect = document.querySelector('#map-select');
const startMatchButton = document.querySelector('#start-match');
const ownerLabel = document.querySelector('#owner-label');
const connectionLabel = document.querySelector('#connection');
const roundScore = document.querySelector('#round-score');
const matchTitle = document.querySelector('#match-title');
const roundMessage = document.querySelector('#round-message');
const matchInstructions = document.querySelector('#match-instructions');
const socketUrl = import.meta.env.VITE_SOCKET_URL?.trim();
const socket = socketUrl ? io(socketUrl, { withCredentials: true }) : io();

let localId = null;
let currentRoom = null;
let runtime = null;
let matchActive = false;
let intermission = false;
let settings = { ...DEFAULT_SETTINGS };
settings = loadSettings();

function applyMobileControls() {
  hud.classList.toggle('mobile-controls-enabled', settings.mobileControls);
  matchInstructions.textContent = settings.mobileControls
    ? 'Analógico mover · Arraste para mirar · ATIRAR para disparo contínuo · C/Q/E/X habilidades · Bomba F'
    : 'WASD mover · Space pular · Ctrl/Shift abaixar · Mouse mirar · Clique atirar · C/Q/E/X habilidades · ESC liberar o mouse';
}

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('zueira-fps-settings') ?? '{}');
    return {
      sensitivity: Number.isFinite(saved.sensitivity)
        ? Math.min(0.008, Math.max(0.0005, saved.sensitivity))
        : DEFAULT_SETTINGS.sensitivity,
      neonQuality: ['low', 'medium', 'high'].includes(saved.neonQuality) ? saved.neonQuality : 'medium',
      fov: Number.isFinite(saved.fov) ? Math.min(110, Math.max(60, saved.fov)) : DEFAULT_SETTINGS.fov,
      crosshairColor: Object.hasOwn(CROSSHAIR_COLORS, saved.crosshairColor)
        ? saved.crosshairColor
        : DEFAULT_SETTINGS.crosshairColor,
      crosshairSize: Number.isFinite(saved.crosshairSize)
        ? Math.min(30, Math.max(6, saved.crosshairSize))
        : DEFAULT_SETTINGS.crosshairSize,
      invertY: saved.invertY === true,
      showFps: saved.showFps === true,
      mobileControls: typeof saved.mobileControls === 'boolean'
        ? saved.mobileControls
        : DEFAULT_SETTINGS.mobileControls,
    };
  } catch {
    menuError.textContent = 'As configurações salvas não puderam ser lidas; usando os valores padrão.';
    return { ...DEFAULT_SETTINGS };
  }
}

function loadSettings() {
  settings = readSettings();
  document.querySelector('#sensitivity').value = String(settings.sensitivity);
  document.querySelector('#sensitivity-value').value = settings.sensitivity.toFixed(4);
  document.querySelector('#neon-quality').value = settings.neonQuality;
  document.querySelector('#fov').value = String(settings.fov);
  document.querySelector('#fov-value').value = `${settings.fov}°`;
  document.querySelector('#crosshair-color').value = settings.crosshairColor;
  document.querySelector('#crosshair-size').value = String(settings.crosshairSize);
  document.querySelector('#crosshair-size-value').value = `${settings.crosshairSize}px`;
  document.querySelector('#invert-y').checked = settings.invertY;
  document.querySelector('#show-fps-setting').checked = settings.showFps;
  document.querySelector('#mobile-controls-setting').checked = settings.mobileControls;
  applyCrosshairSettings();
  applyMobileControls();
  return settings;
}

function saveSettings() {
  settings = {
    sensitivity: Number(document.querySelector('#sensitivity').value),
    neonQuality: document.querySelector('#neon-quality').value,
    fov: Number(document.querySelector('#fov').value),
    crosshairColor: document.querySelector('#crosshair-color').value,
    crosshairSize: Number(document.querySelector('#crosshair-size').value),
    invertY: document.querySelector('#invert-y').checked,
    showFps: document.querySelector('#show-fps-setting').checked,
    mobileControls: document.querySelector('#mobile-controls-setting').checked,
  };
  try {
    localStorage.setItem('zueira-fps-settings', JSON.stringify(settings));
    applyCrosshairSettings();
    applyMobileControls();
    runtime?.updateSettings(settings);
    menuError.textContent = '';
  } catch {
    menuError.textContent = 'Não foi possível salvar as configurações neste navegador.';
  }
}

function applyCrosshairSettings() {
  document.documentElement.style.setProperty('--crosshair-color', CROSSHAIR_COLORS[settings.crosshairColor]);
  document.documentElement.style.setProperty('--crosshair-size', `${settings.crosshairSize}px`);
}

function sendAcknowledged(event, ...args) {
  return new Promise((resolve) => {
    socket.timeout(5000).emit(event, ...args, (error, response) => {
      resolve(error ? { ok: false, reason: 'timeout' } : response);
    });
  });
}

function updateRoomView(room) {
  currentRoom = room;
  roomCodeLabel.textContent = room.code;
  const teams = {
    attackers: room.players.filter(({ team }) => team === 'attackers'),
    defenders: room.players.filter(({ team }) => team === 'defenders'),
  };
  for (const [team, players] of Object.entries(teams)) {
    const list = document.querySelector(`#${team}-players`);
    list.replaceChildren();
    for (const player of players) {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = player.nickname;
      const role = document.createElement('small');
      role.textContent = `${AGENT_NAMES[player.agent] ?? 'Kaneca'}${player.id === room.ownerId ? ' · anfitrião' : ''}`;
      item.append(name, role);
      list.append(item);
    }
    document.querySelector(`#${team}-count`).textContent = `${players.length}`;
  }
  lobbyCount.textContent = `${room.players.length} jogadores`;
  const localMember = room.players.find(({ id }) => id === localId);
  document.querySelector('#agent-select').value = localMember?.agent ?? 'kaneca';
  const isOwner = room.ownerId === localId;
  ownerLabel.textContent = isOwner ? 'Você é o anfitrião da sala.' : 'O anfitrião controla o mapa e inicia a partida.';
  mapSelect.disabled = !isOwner;
  mapSelect.value = room.map;
  const bothTeams = teams.attackers.length > 0 && teams.defenders.length > 0;
  startMatchButton.disabled = !isOwner || room.players.length < 2 || !bothTeams;
  startMatchButton.textContent = !bothTeams
    ? 'Escolha os dois times para iniciar'
    : room.players.length < 2
      ? 'Aguardando mais jogadores'
      : 'Iniciar Partida';
  document.querySelectorAll('[data-team]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.team === localMember?.team);
  });
  roundScore.textContent = `ROUNDS ${room.roundsWon.attackers} — ${room.roundsWon.defenders}`;
}

function openLobby(room) {
  updateRoomView(room);
  mainMenu.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  matchScreen.classList.add('hidden');
  resumeScreen.classList.add('hidden');
  hud.classList.remove('playing');
}

function showRoundOverlay() {
  matchScreen.classList.remove('hidden');
  resumeScreen.classList.add('hidden');
}

async function loadGameRuntime(room) {
  if (runtime) {
    runtime.dispose();
    runtime = null;
  }
  const { createGameRuntime } = await import('./game-runtime.js');
  runtime = createGameRuntime({
    socket,
    settings,
    localId,
    mapId: room.map,
    onExit: (replacementCanvas) => {
      canvas = replacementCanvas;
      runtime = null;
      showLobbyAfterMatch();
    },
  });
  currentRoom = room;
}

function showLobbyAfterMatch() {
  matchActive = false;
  intermission = false;
  mainMenu.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
  matchScreen.classList.add('hidden');
  resumeScreen.classList.add('hidden');
  hud.classList.remove('playing');
  canvas.classList.remove('visible');
  if (currentRoom) updateRoomView(currentRoom);
}

document.querySelector('#sensitivity').addEventListener('input', (event) => {
  document.querySelector('#sensitivity-value').value = Number(event.currentTarget.value).toFixed(4);
});
document.querySelector('#fov').addEventListener('input', (event) => {
  document.querySelector('#fov-value').value = `${event.currentTarget.value}°`;
});
document.querySelector('#crosshair-size').addEventListener('input', (event) => {
  document.querySelector('#crosshair-size-value').value = `${event.currentTarget.value}px`;
});
document.querySelector('#open-settings').addEventListener('click', () => document.querySelector('#settings-dialog').showModal());
document.querySelector('#save-settings').addEventListener('click', saveSettings);
document.querySelector('#open-feedback').addEventListener('click', () => document.querySelector('#feedback-dialog').showModal());
document.querySelector('#close-feedback').addEventListener('click', () => document.querySelector('#feedback-dialog').close());
document.querySelector('#feedback-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const message = document.querySelector('#feedback-message').value.trim();
  sendAcknowledged('feedback:submit', { message }).then((response) => {
    document.querySelector('#feedback-status').textContent = response?.ok
      ? 'Obrigado! Seu feedback foi enviado.'
      : 'Não foi possível enviar. Verifique a conexão e tente novamente.';
    if (response?.ok) document.querySelector('#feedback-message').value = '';
  });
});

document.querySelector('#create-room').addEventListener('click', () => {
  menuError.textContent = '';
  sendAcknowledged('room:create', { nickname: nicknameInput.value }).then((response) => {
    if (!response?.ok) {
      menuError.textContent = response?.reason === 'nickname-required'
        ? 'Digite um nickname para continuar.'
        : 'Não foi possível criar a sala.';
      return;
    }
    openLobby(response.room);
  });
});
document.querySelector('#open-join').addEventListener('click', () => {
  joinForm.classList.remove('hidden');
  joinCodeInput.focus();
});
document.querySelector('#cancel-join').addEventListener('click', () => {
  joinForm.classList.add('hidden');
  document.querySelector('#open-join').focus();
});
joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  sendAcknowledged('room:join', { nickname: nicknameInput.value, code: joinCodeInput.value }).then((response) => {
    if (!response?.ok) {
      menuError.textContent = {
        'nickname-required': 'Digite um nickname para continuar.',
        'room-not-found': 'Sala não encontrada. Confira o código.',
        'room-running': 'Esta sala já está em partida.',
        timeout: 'A conexão expirou. Verifique o servidor e tente novamente.',
      }[response?.reason] ?? 'Não foi possível entrar na sala.';
      return;
    }
    openLobby(response.room);
  });
});

document.querySelectorAll('[data-team]').forEach((button) => {
  button.addEventListener('click', () => {
    sendAcknowledged('room:select-team', button.dataset.team).then((response) => {
      if (!response?.ok) lobbyError.textContent = 'Não foi possível escolher esse time.';
    });
  });
});
document.querySelector('#agent-select').addEventListener('change', (event) => {
  sendAcknowledged('room:select-agent', event.currentTarget.value).then((response) => {
    if (!response?.ok) lobbyError.textContent = 'Não foi possível selecionar esse agente.';
  });
});
mapSelect.addEventListener('change', () => {
  sendAcknowledged('room:select-map', mapSelect.value).then((response) => {
    if (!response?.ok) lobbyError.textContent = 'Somente o anfitrião pode escolher o mapa.';
  });
});
startMatchButton.addEventListener('click', () => {
  lobbyError.textContent = '';
  sendAcknowledged('room:start', {}).then((response) => {
    if (!response?.ok) lobbyError.textContent = {
      'need-two-players': 'São necessários pelo menos 2 jogadores.',
      'need-both-teams': 'É necessário ter ao menos um jogador em cada time.',
      timeout: 'A conexão expirou ao iniciar a partida.',
    }[response?.reason] ?? 'Somente o anfitrião pode iniciar a partida.';
  });
});
document.querySelector('#copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(roomCodeLabel.textContent);
    document.querySelector('#copy-code').textContent = 'Copiado';
  } catch {
    lobbyError.textContent = 'Não foi possível copiar o código; selecione e copie manualmente.';
  }
});
document.querySelector('#leave-room').addEventListener('click', () => {
  sendAcknowledged('room:leave').then((response) => {
    if (!response?.ok) {
      lobbyError.textContent = 'Não foi possível sair da sala; verifique a conexão.';
      return;
    }
    currentRoom = null;
    mainMenu.classList.remove('hidden');
    lobbyScreen.classList.add('hidden');
  });
});

function enterGameplay() {
  if (settings.mobileControls) {
    matchScreen.classList.add('hidden');
    resumeScreen.classList.add('hidden');
    return;
  }
  canvas.requestPointerLock();
}

document.querySelector('#play-button').addEventListener('click', enterGameplay);
document.querySelector('#resume-button').addEventListener('click', enterGameplay);
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    matchScreen.classList.add('hidden');
    resumeScreen.classList.add('hidden');
  } else if (!settings.mobileControls && matchActive && !intermission) {
    resumeScreen.classList.remove('hidden');
  }
});

socket.on('connect', () => {
  connectionLabel.textContent = 'Conectado';
  connectionLabel.classList.add('connected');
});
socket.on('disconnect', () => {
  connectionLabel.textContent = 'Desconectado';
  connectionLabel.classList.remove('connected');
});
socket.on('player:assigned', ({ id }) => {
  localId = id;
});
socket.on('room:state', (room) => {
  if (!currentRoom || currentRoom.code === room.code) {
    currentRoom = room;
    if (!matchActive) updateRoomView(room);
  }
});
socket.on('match:started', (room) => {
  matchActive = true;
  intermission = false;
  currentRoom = room;
  mainMenu.classList.add('hidden');
  lobbyScreen.classList.add('hidden');
  matchScreen.classList.remove('hidden');
  resumeScreen.classList.add('hidden');
  hud.classList.add('playing');
  canvas.classList.add('visible');
  loadGameRuntime(room).catch((error) => {
    matchActive = false;
    canvas.classList.remove('visible');
    hud.classList.remove('playing');
    lobbyScreen.classList.remove('hidden');
    lobbyError.textContent = `Não foi possível carregar a partida: ${error.message}`;
  });
});
socket.on('round:state', ({ round, roundsWon }) => {
  intermission = false;
  matchTitle.textContent = `Round ${round}`;
  roundMessage.textContent = 'A rodada está em andamento.';
  roundScore.textContent = `ROUNDS ${roundsWon.attackers} — ${roundsWon.defenders}`;
  if (settings.mobileControls || document.pointerLockElement !== canvas) showRoundOverlay();
  runtime?.roundStarted();
});
socket.on('round:over', ({ round, winner, result, roundsWon }) => {
  intermission = true;
  matchTitle.textContent = `Round ${round}`;
  roundMessage.textContent = result === 'defused'
    ? 'Bomba desarmada — vitória dos Defensores'
    : result === 'exploded'
      ? 'Bomba detonada — vitória dos Atacantes'
      : winner
        ? `Vitória dos ${winner === 'attackers' ? 'Atacantes' : 'Defensores'}`
        : 'Rodada empatada';
  roundScore.textContent = `ROUNDS ${roundsWon.attackers} — ${roundsWon.defenders}`;
  showRoundOverlay();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
});
socket.on('match:ended', () => {
  runtime?.dispose();
  runtime = null;
  showLobbyAfterMatch();
});
