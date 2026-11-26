import { defineConfig } from 'vite';

export default defineConfig({
  base: '/ZUEIRA-KKKKKJ/',
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
