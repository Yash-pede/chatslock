import globals from "globals"
import { config } from "@repo/eslint-config/base"

/** Plain-JS Lambda: node + es2022 globals, no TypeScript magic. */
export default [
  ...config,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
  },
  {
    rules: {
      "turbo/no-undeclared-env-vars": "off",
    },
  },
]
