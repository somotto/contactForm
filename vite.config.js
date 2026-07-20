import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),     // vendor dashboard (root)
        event: resolve(__dirname, 'e.html'),        // public contact form via short URL
        register: resolve(__dirname, 'register.html'), // vendor registration
      },
    },
  },
});
