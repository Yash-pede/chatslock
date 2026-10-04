// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

config.watchFolders = [monorepoRoot];

// 2. Force Metro to resolve dependencies from the app node_modules and the monorepo root node_modules
config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
    path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Leave hierarchical node_modules lookup enabled (the default).
// pnpm's isolated store only exposes transitive deps (e.g. whatwg-fetch, pulled in
// by @expo/metro-runtime) through the nested .pnpm node_modules dirs, so disabling
// hierarchical lookup makes the bundle fail with "Unable to resolve module".

module.exports = config;
