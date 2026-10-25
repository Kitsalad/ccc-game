import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Two pages: the grow room (/) and Tokin Wars (/wars/).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        wars: resolve(__dirname, 'wars/index.html')
      }
    }
  }
});
