const { withSettingsGradle } = require('@expo/config-plugins');

// Expo's module resolver autolinks @sentry/react-native a second time as a
// legacy react-native.config.js module ("sentry-react-native" project),
// duplicating the registration React Native's own settings-plugin
// autolinking already creates ("sentry_react-native") for the identical
// sourceDir. The two projects collide on every Gradle output they both
// produce (codegen schema, resValues, ...) since both build the same code.
// See docs/audit/mobile.md for the full investigation.
function withSentryAutolinkFix(config) {
  return withSettingsGradle(config, (config) => {
    const before = 'useExpoModules()';
    const after = "useExpoModules(exclude: ['@sentry/react-native'])";
    if (config.modResults.contents.includes(before)) {
      config.modResults.contents = config.modResults.contents.replace(before, after);
    } else if (!config.modResults.contents.includes(after)) {
      throw new Error(
        'withSentryAutolinkFix: expected "useExpoModules()" in settings.gradle but did not find it. ' +
        'The Expo prebuild template may have changed - check whether the Sentry double-autolinking bug still applies.'
      );
    }
    return config;
  });
}

module.exports = withSentryAutolinkFix;
