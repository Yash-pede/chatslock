import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import prettier from "eslint-config-prettier";
import onlyWarn from "eslint-plugin-only-warn";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

/** @type {import("eslint").Linter.Config} */
export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.react,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // One text primitive for the whole package. Without this the rule holds
      // only by convention, and the next component written here reaches for
      // `Text` from react-native — the obvious import — and silently opts out
      // of the type scale and the tone vocabulary.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["Text"],
              // Matched on the *imported* name, not the local one, so this
              // also catches `import * as RN` followed by `RN.Text`.
              message:
                "Use the Text primitive from ./text — it carries the type scale and the tone vocabulary. Import RN's Text only in src/components/text.tsx.",
            },
          ],
        },
      ],
    },
  },
  {
    // The primitive itself is the one legitimate caller: it *is* the wrapper
    // around RN's Text. Scoped to this exact file rather than switched off, so
    // the exemption is visible at the point it applies.
    files: ["src/components/text.tsx"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  prettier,
  {
    plugins: { "only-warn": onlyWarn },
  },
];
