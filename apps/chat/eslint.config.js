// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Scoped to src deliberately: an entry with rules but no `files` matches
    // nothing at all, and ESLint then reports "file ignored because no matching
    // configuration was supplied" for every file — a green run that checked
    // nothing.
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // The app draws all of its text through the design system's Text
      // primitive. React Native's Text is the obvious import and it silently
      // opts out of the type scale and the tone vocabulary, so the tokens and
      // `variant`/`tone` contract every screen is written against stops
      // applying. Nothing in this app needs the raw primitive, so there is no
      // exempt caller here — a file that later needs to wrap or re-export Text
      // must add its own narrow `files` exemption rather than weaken this one.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["Text"],
              // Matched on the *imported* name, not the local one, so this also
              // catches `Text as RNText` and `import * as RN` + `RN.Text`.
              message:
                "Use Text from @chatslock/ui — it carries the type scale and the tone vocabulary. React Native's Text is not part of this app's component vocabulary.",
            },
          ],
          // `paths` matches the exact specifier, so the deep import
          // `react-native/Libraries/Text/Text` walks past it — and unlike the
          // alias dodges, that one still compiles, because SDK 57 really does
          // resolve that file. `patterns` are minimatch-style globs, which is
          // what catches the internal path.
          patterns: [
            {
              group: [
                "react-native/Libraries/Text",
                "react-native/Libraries/Text/*",
              ],
              message:
                "Import Text from @chatslock/ui. Reaching into react-native's internals for it also opts out of the type scale and the tone vocabulary.",
            },
          ],
        },
      ],
      // The gap `no-restricted-imports` leaves open: `importNames` does not
      // match a default or namespace import, so `import RN from 'react-native'`
      // followed by `RN.Text` walks straight past the rule above. Nothing in
      // this app imports React Native as a value, so banning the default
      // import outright closes the hole without costing a legitimate caller.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value='react-native'] > ImportDefaultSpecifier",
          message:
            "Import named primitives from 'react-native' (View, StyleSheet, ...). The default import bypasses the no-restricted-imports rule above, including its ban on Text.",
        },
      ],
    },
  },
]);
