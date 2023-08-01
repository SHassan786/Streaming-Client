import dns from 'dns';
import { defineConfig } from 'vite';

dns.setDefaultResultOrder('verbatim');
console.log("running from sample.ts")
export default defineConfig({
  server: {
    port: 8080,
    open: true,
  },
  build: {
    minify: 'esbuild',
    target: 'es2019',
    },
  test: {
    environment: 'jsdom',
  },
});
