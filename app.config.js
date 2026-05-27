// Root-level app config for EAS monorepo builds.
// EAS is run from the repo root so that yarn install resolves the
// @vars/shared workspace package. This file re-exports the mobile
// app config with all asset paths rewritten to absolute paths so
// Expo resolves them correctly against the monorepo root.
const path = require('path');

const MOBILE = path.join(__dirname, 'apps/mobile');

module.exports = {
  expo: {
    name: 'VARS',
    slug: 'vars',
    version: '1.0.0',
    orientation: 'portrait',
    icon: path.join(MOBILE, 'assets/images/icon.png'),
    scheme: 'vars',
    userInterfaceStyle: 'light',
    splash: {
      image: path.join(MOBILE, 'assets/images/splash.png'),
      resizeMode: 'contain',
      backgroundColor: '#000000',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.vars.app',
      config: {
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'VARS needs your location to show you vendors nearby.',
        NSLocationAlwaysAndWhenInUseUsageDescription: 'VARS uses your location to find vendors near you.',
        NSCameraUsageDescription: 'VARS needs camera access to upload your profile photo.',
        NSPhotoLibraryUsageDescription: 'VARS needs photo library access to upload your profile photo.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: path.join(MOBILE, 'assets/images/icon-padded.png'),
        backgroundColor: '#FFFFFF',
      },
      config: {
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
      package: 'com.vars.app',
      permissions: [
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'CAMERA',
        'READ_EXTERNAL_STORAGE',
        'RECEIVE_BOOT_COMPLETED',
        'VIBRATE',
      ],
    },
    web: {
      bundler: 'metro',
      output: 'static',
      favicon: path.join(MOBILE, 'assets/images/favicon.png'),
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      [
        'expo-build-properties',
        {
          android: {
            newArchEnabled: false,
          },
        },
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'VARS needs your location to show you vendors nearby.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: path.join(MOBILE, 'assets/images/notification-icon.png'),
          color: '#0A7AFF',
        },
      ],
    ],
    updates: {
      url: 'https://u.expo.dev/e7b18395-9c2e-40d9-b667-63d030784790',
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    experiments: {
      typedRoutes: true,
    },
    extra: {
      router: {
        origin: false,
        // Monorepo: EAS runs from repo root, but routes live in apps/mobile/app/.
        // expo-router uses this to set EXPO_ROUTER_APP_ROOT correctly at bundle time.
        root: 'apps/mobile/app',
      },
      eas: {
        projectId: 'e7b18395-9c2e-40d9-b667-63d030784790',
      },
    },
    owner: 'kant01',
  },
};
