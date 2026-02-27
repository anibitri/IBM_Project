/**
 * Global Theme — derived from the DocumentScreen chat overlay.
 * Clean, professional, light design with indigo (#5856D6) accents.
 */

export const colors = {
  // Core palette
  primary:        '#5856D6',   // Indigo — buttons, FABs, user bubbles, active accents
  primaryLight:   '#7A79E0',   // Lighter indigo for hover / pressed states
  primaryFaded:   'rgba(88, 86, 214, 0.10)', // Tinted backgrounds
  secondary:      '#007AFF',   // iOS blue — links, secondary actions
  secondaryLight: '#e6f0ff',   // Tinted secondary background

  // Surfaces
  background:     '#F2F4F8',   // App-wide canvas
  surface:        '#FFFFFF',   // Cards, modals, input containers
  surfaceAlt:     '#FAFAFA',   // Slightly different white for nested cards

  // Text
  textPrimary:    '#1A1A1A',   // Titles, headings
  textSecondary:  '#333333',   // Body text
  textMuted:      '#666666',   // Secondary descriptions
  textPlaceholder:'#999999',   // Placeholder & timestamps
  textOnPrimary:  '#FFFFFF',   // Text on indigo / dark surfaces

  // Borders & dividers
  border:         '#D1D1D6',
  borderLight:    '#E1E4E8',
  divider:        '#E5E5EA',

  // Semantic
  success:        '#34C759',
  warning:        '#FF9500',
  error:          '#FF3B30',

  // Chat
  chatUserBubble: '#5856D6',
  chatBotBubble:  '#E1E4E8',

  // Navigation
  tabActive:      '#5856D6',
  tabInactive:    '#999999',
  headerBg:       '#F2F4F8',
};

export const spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  xxl: 30,
};

export const radii = {
  sm:     8,
  md:    12,
  lg:    16,
  xl:    20,
  full:  999,
};

export const typography = {
  largeTitle:  { fontSize: 28, fontWeight: '800' },
  title:       { fontSize: 22, fontWeight: '700' },
  headline:    { fontSize: 18, fontWeight: '700' },
  body:        { fontSize: 16, fontWeight: '400' },
  subhead:     { fontSize: 15, fontWeight: '400' },
  caption:     { fontSize: 13, fontWeight: '400' },
  label:       { fontSize: 12, fontWeight: '600' },
};

export const shadows = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  elevated: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  fab: {
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 5,
  },
};

const theme = { colors, spacing, radii, typography, shadows };
export default theme;
