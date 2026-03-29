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
 * Derives a short, human-readable session name from the document data.
 *
 * Resolution order:
 *  1. First meaningful sentence from the AI summary (≤ 50 chars, whole words)
 *  2. Comma-joined labels of the first three detected AR components
 *  3. Filename without extension
 *
 * @param {object} doc - The loaded document object.
 * @returns {string}
 */
export function deriveSessionName(doc) {
  const summary = doc?.ai_summary || '';
  if (summary) {
    let text = summary;
    // Strip prompt fragments that may have leaked into the summary
    const markers = ['Summary:', 'Analysis:', 'Provide a clear'];
    for (const marker of markers) {
      const idx = text.lastIndexOf(marker);
      if (idx !== -1) text = text.slice(idx + marker.length);
    }
    text = text.trimStart();

    const firstSentence = text.split(/[.\n]/).find((s) => s.trim().length > 10);
    if (firstSentence) {
      let name = firstSentence.trim().replace(/\*+/g, '').substring(0, 50);
      // Trim to last whole word if cut mid-word
      if (name.length === 50) {
        const lastSpace = name.lastIndexOf(' ');
        if (lastSpace > 20) name = name.substring(0, lastSpace);
      }
      return name;
    }
  }

  const components = doc?.ar?.components || [];
  if (components.length > 0) {
    const labels = components.slice(0, 3).map((c) => c.label).filter(Boolean);
    if (labels.length > 0) return labels.join(', ');
  }

  const rawName = doc?.file?.original_name || doc?.file?.name || 'Untitled';
  return rawName.replace(/\.[^.]+$/, '');
}
