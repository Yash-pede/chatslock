import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/schema/index.ts", "src/req/index.ts"],
  clean: true,
  splitting: false,
  format: ["esm"],
  target: "es2022",
  sourcemap: true,
})
