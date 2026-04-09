/**
 * Resolves the backend base URL based on the current runtime environment.
 *
 * Resolution order (first truthy wins):
 *  1. Explicit TUNNEL_URL  (ngrok / any public tunnel)
 *  2. Browser environment  → relative `/api` (Vite proxy handles forwarding)
 *  3. Android emulator     → 10.0.2.2 alias for the host machine
 *  4. iOS physical device  → IOS_USB_HOST:4200
 *  5. iOS simulator        → localhost:4200
 *
 * To extend for a new environment, add a new conditional before the
 * iOS-simulator fallback — do not modify existing branches.
 */

// ── Environment flags ─────────────────────────────────────────────────────────
// Set PHYSICAL_DEVICE = true when running on a real iOS device via USB.
// Android physical devices use `adb reverse` so they always resolve to localhost.
const PHYSICAL_DEVICE = true;

// Tunnel URL for remote access (ngrok, localtunnel, etc.).
// Set to null or an empty string to disable tunnel routing.
const TUNNEL_URL = null;

// iOS physical device only: the Mac's iPhone USB interface IP address.
// Find it via: System Preferences → Network → "iPhone USB"
// Android physical device ignores this value.
const IOS_USB_HOST = '192.168.x.x';

/**
 * Returns the base URL for all API requests.
 * @returns {string}
 */
export function resolveBaseURL() {
  // Web browser always uses the Vite dev-server proxy (/api → localhost:4200).
  // This check must come first so TUNNEL_URL never overrides web routing.
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return '/api';
  }

  // React Native — tunnel takes priority when set (remote / physical device)
  if (TUNNEL_URL) {
    return `${TUNNEL_URL}/api`;
  }

  // Android emulator: 10.0.2.2 is the special alias for the host machine
  try {
    const isAndroid =
      typeof navigator !== 'undefined' &&
      /android/i.test(navigator.userAgent || '');
    if (isAndroid && !PHYSICAL_DEVICE) {
      return 'http://10.0.2.2:4200/api';
    }
  } catch {
    // navigator not available in all environments — safe to ignore
  }

  // iOS physical device via USB
  if (PHYSICAL_DEVICE) {
    return `http://${IOS_USB_HOST}:4200/api`;
  }

  // iOS simulator (shares the Mac's network stack)
  return 'http://localhost:4200/api';
}
