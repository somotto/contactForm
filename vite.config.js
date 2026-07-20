import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),        // dashboard (root)
        form: resolve(__dirname, 'form.html'),         // contact form
        register: resolve(__dirname, 'register.html'),
      },
    },
  },
});