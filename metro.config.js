// Metro config for EAS monorepo builds run from the repo root.
// Sets projectRoot to apps/mobile/ so that:
//   - Expo Router finds routes at apps/mobile/app/
//   - babel.config.js (with react-native-reanimated/plugin) is picked up
//   - @/ alias and tsconfig paths resolve correctly
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = path.join(__dirname, 'apps/mobile');
const monorepoRoot = __dirname;

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

module.exports = config;
