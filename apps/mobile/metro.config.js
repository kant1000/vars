const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Metro doesn't honour package.json `exports` subpath maps; patch known offenders.
const packageExportsShims = {
  '@posthog/core/surveys': path.resolve(monorepoRoot, 'node_modules/@posthog/core/dist/surveys/index.js'),
};
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (packageExportsShims[moduleName]) {
    return { filePath: packageExportsShims[moduleName], type: 'sourceFile' };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
