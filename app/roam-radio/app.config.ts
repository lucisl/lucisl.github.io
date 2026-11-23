import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'RoamRadio',
  slug: 'roam-radio',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  scheme: 'roamradio',
  ios: {
    bundleIdentifier: 'com.fredgroup.roamradio',
    supportsTablet: true,
    infoPlist: {
      UIBackgroundModes: ['audio'],
      CFBundleDisplayName: 'RoamRadio',
      // 电台流大量使用 http；仅对媒体播放放行，其余网络保持 ATS 保护
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoadsForMedia: true,
      },
      LSApplicationQueriesSchemes: ['orpheus', 'qqmusic', 'spotify'],
    },
  },
  plugins: [
    [
      'expo-audio',
      {
        isAudioBackgroundEnabled: true,
      },
    ],
    'expo-sqlite',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: '#0b1120',
      },
    ],
  ],
});
