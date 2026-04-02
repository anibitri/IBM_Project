/**
 * Pure utility functions for session identity and naming.
 *
 * These functions have no React dependencies and no side effects, making
 * them easy to unit-test and safe to use on both web and mobile.
 */

/**
 * Generates a unique session identifier.
 * Format: `<timestamp>-<random>` (e.g. "1714000000000-a3f9b2c1").
 *
 * @returns {string}
 */
export function makeSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Derives a session name from the uploaded file metadata.
 *
 * Resolution order:
 *  1. Original uploaded filename
 *  2. Stored/uploaded filename
 *  3. Untitled
 *
 * @param {object} doc - The loaded document object.
 * @returns {string}
 */
export function deriveSessionName(doc) {
  return doc?.file?.original_name || doc?.file?.name || 'Untitled';
}
