import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['index.ts', 'auth/index.ts'],
    clean: true,
    format: ['esm'],
    target: 'es2022',
    sourcemap: true,
});
