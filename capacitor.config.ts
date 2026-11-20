/** The Android app: the phone app (built into docs/) inside a native shell. */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alton.phone',
  appName: 'Alton',
  webDir: 'docs',
  // The app's own address is https://localhost (the PC allows it, see remote-server.ts).
  server: { androidScheme: 'https' },
  backgroundColor: '#050a10',
  android: {
    allowMixedContent: false,
    // Keep the app below the status bar and above the gesture bar on Android 15+.
    adjustMarginsForEdgeToEdge: 'force',
  },
  plugins: {
    LocalNotifications: { iconColor: '#3FD0FF' },
  },
};

export default config;
