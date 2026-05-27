// react-native.config.js — repo root
//
// When expo prebuild runs from the monorepo root, React Native CLI autolinking
// reads *this* project's package.json to find which native modules to link.
// The root package.json only has supabase — all the RN community modules live
// in apps/mobile/package.json. Without this file, none of them get linked into
// the Android/iOS native project, causing "unknown view tag" crashes at runtime.
//
// This file explicitly points the linker at every react-native-* and
// @react-native-* package from the mobile workspace.

const path = require('path');
const mobilePkg = require('./apps/mobile/package.json');

const dependencies = {};

Object.keys(mobilePkg.dependencies || {}).forEach((name) => {
  if (name === 'react-native') return; // the runtime itself — not a linkable module
  if (
    name.startsWith('react-native-') ||
    name.startsWith('@react-native')
  ) {
    dependencies[name] = {
      root: path.join(__dirname, 'node_modules', name),
    };
  }
});

// dependencies resolved:
//   react-native-gesture-handler
//   react-native-maps
//   react-native-reanimated
//   react-native-safe-area-context
//   react-native-screens       ← the one causing "unknown view tag: 3"
//   react-native-svg
//   react-native-webview
//   @react-native-async-storage/async-storage

module.exports = { dependencies };
