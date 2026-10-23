import { defineConfig } from "tsup"
import dotenv from "dotenv"

dotenv.config()

export default defineConfig({
  entry: ["src/dao/index.ts", "src/utils/index.ts", "src/req/index.ts", "src/core/index.ts"],
  clean: true,
  splitting: false,
  format: ["esm"],
  target: "es2022",
  sourcemap: true,
  env: {
    AWS_REGION: process.env.AWS_REGION!,
    SECRET_NAME: process.env.SECRET_NAME!,
  },
})
