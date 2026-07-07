/**
 * Capacitor shell config (user-stories/typescript_email_ui.md): wraps Vite's
 * build output (dist) for iOS/Android. @capacitor-community/sqlite is the
 * only native plugin (jeep-sqlite serves the web pathway). Platform setup
 * (`npx cap add ios|android`) is documented in the README, never executed
 * from tests.
 */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jojimail.app',
  appName: 'JojiMailAI',
  webDir: 'dist',
};

export default config;
