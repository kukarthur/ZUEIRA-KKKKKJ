import test from 'node:test';
import assert from 'node:assert/strict';
import config from '../vite.config.js';

test('proxies same-origin Socket.IO and WebSocket traffic to the backend', () => {
  const socketProxy = config.server.proxy['/socket.io'];
  assert.equal(socketProxy.target, 'http://localhost:3000');
  assert.equal(socketProxy.ws, true);
});
