/**
 * Utilities for cleaning raw AI-generated summary text.
 *
 * The backend occasionally includes instruction fragments at the start
 * of its response. This module strips known markers so the UI renders
 * only the actual analysis content.
 */

const PROMPT_MARKERS = [
  'Provide a clear, structured analysis:',
  'Provide a clear, concise answer:',
  'Summary:',
  'Analysis:',
  'You are an expert technical analyst.',
  'Task:',
];

/**
 * Removes leaked prompt artifacts from a raw AI summary string.
 *
 * @param {string} raw - The raw AI summary.
 * @returns {string} The cleaned summary, or 'No summary available'.
 */
export function cleanSummary(raw) {
  if (!raw) return 'No summary available';

  let text = raw;
  for (const marker of PROMPT_MARKERS) {
    const idx = text.lastIndexOf(marker);
    if (idx !== -1) text = text.slice(idx + marker.length);
  }

  // Strip any context blocks that leaked into the response
  text = text.replace(/^Context:\s*[\s\S]*?(?=\n\n|\n[A-Z])/i, '');
  text = text.replace(/^Document Text:\s*[\s\S]*?(?=\n\n)/i, '');
  text = text.replace(/^Visual Analysis:\s*[\s\S]*?(?=\n\n)/i, '');
  text = text.replace(/^[\s\n:]+/, '').replace(/[\s\n]+$/, '');

  return text || 'No summary available';
}
