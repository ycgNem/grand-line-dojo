import { defineConfig } from 'vite';

// A launcher may hand us a port through the PORT environment variable; otherwise use 5183.
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

export default defineConfig({
  base: './',
  server: { port: Number(env.PORT) || 5183, strictPort: false },
});
