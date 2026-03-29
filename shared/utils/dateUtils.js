/**
 * Shared date/time formatting utilities used across web and mobile.
 */

/**
 * Returns a human-readable relative time string for a timestamp.
 *
 * @param {number} ts - Unix timestamp in milliseconds.
 * @returns {string} e.g. "Just now", "5m ago", "3h ago", "2d ago", or locale date.
 */
export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
