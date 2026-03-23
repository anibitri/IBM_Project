/* ═══════════════════════════════════════════════════════════
   APPLE LIQUID GLASS — MOBILE DESIGN TOKENS
   ═══════════════════════════════════════════════════════════ */

export const colors = {
  primary: '#2997ff',
  primaryGlass: 'rgba(41,151,255,0.16)',
  success: '#30d158',
  error: '#ff453a',
  warning: '#ffd60a',
  background: '#F2F2F7',
  white: '#FFFFFF',
  text: '#1C1C1E',
  textLight: '#8E8E93',
  border: '#E5E5EA',
  arBox: '#2997ff',
  arBoxSelected: '#30d158',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' },
  h2: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 16 },
  caption: { fontSize: 14 },
};

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 100,
};

/* Runtime palette — call getPalette(darkMode) in each screen */
export const getPalette = (darkMode) =>
  darkMode
    ? {
        bg: '#07080e',
        card: 'rgba(255,255,255,0.07)',
        cardAbs: '#10141f',
        cardSoft: 'rgba(255,255,255,0.11)',
        cardSoftAbs: '#181e2e',
        border: 'rgba(255,255,255,0.10)',
        borderTop: 'rgba(255,255,255,0.24)',
        text: 'rgba(255,255,255,0.92)',
        subtext: 'rgba(255,255,255,0.55)',
        muted: 'rgba(255,255,255,0.30)',
        primary: '#2997ff',
        primaryGlass: 'rgba(41,151,255,0.16)',
        primaryGlassStrong: 'rgba(41,151,255,0.28)',
        success: '#30d158',
        error: '#ff453a',
        warning: '#ffd60a',
      }
    : {
        bg: '#F2F2F7',
        card: '#FFFFFF',
        cardAbs: '#FFFFFF',
        cardSoft: '#F2F2F7',
        cardSoftAbs: '#F2F2F7',
        border: '#E5E5EA',
        borderTop: 'rgba(255,255,255,0.9)',
        text: '#1C1C1E',
        subtext: '#8E8E93',
        muted: '#C7C7CC',
        primary: '#007AFF',
        primaryGlass: 'rgba(0,122,255,0.10)',
        primaryGlassStrong: 'rgba(0,122,255,0.20)',
        success: '#34C759',
        error: '#FF3B30',
        warning: '#FF9500',
      };
