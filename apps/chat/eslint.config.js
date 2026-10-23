// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config")
const expoConfig = require("eslint-config-expo/flat")

module.exports = defineConfig([
  expoConfig,
  {
    // Generated code and vendored skill scripts are not ours to lint.
    ignores: ["dist/*", ".expo/*", ".agents/*", ".hermes/*", "android/*", "ios/*"],
  },
])
