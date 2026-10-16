import {defineConfig} from 'tsup';
import dotenv from 'dotenv';

dotenv.config();

export default defineConfig({
    entry: ['src/index.ts', 'src/auth/index.ts', 'src/schema/index.ts', 'src/utils/index.ts', 'src/types/index.ts', 'src/dao/index.ts'],
    clean: true,
    format: ['esm'],
    target: 'es2022',
    sourcemap: true,
    env: {
        AWS_REGION: process.env.AWS_REGION!,
        SECRET_NAME: process.env.SECRET_NAME!,
    }
});
