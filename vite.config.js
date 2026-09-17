import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),     // vendor dashboard (root)
        event: resolve(__dirname, 'e.html'),        // public contact form via short URL
        register: resolve(__dirname, 'register.html'), // vendor registration
        privacy: resolve(__dirname, 'privacy.html'),   // privacy policy
        terms: resolve(__dirname, 'terms.html'),       // terms of use
        faq: resolve(__dirname, 'faq.html'),           // frequently asked questions
      },
    },
  },
});
