import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/auth/index.ts"],
  clean: true,
  format: ["esm"],
  target: "es2022",
  sourcemap: true,
})
