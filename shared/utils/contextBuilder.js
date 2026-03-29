/**
 * Builds the context payloads sent to the AI backend.
 *
 * Centralising this logic guarantees that the web and mobile apps always
 * send identical context shapes to the backend, keeping AI responses
 * consistent regardless of which client is used.
 */

/**
 * Builds the rich context object for a chat message.
 *
 * @param {object} document          - The loaded document object from state.
 * @param {number} [currentPageIndex=-1] - Active page index for multi-page PDFs.
 *                                        Pass -1 to include all-page summaries.
 * @returns {object} Context payload for backend.askQuestion / backend.chat.
 */
export function buildChatContext(document, currentPageIndex = -1) {
  if (!document) return {};

  const images = document.images || [];
  const isPdf = document.type === 'pdf' && images.length > 0;

  let visionContext = document.vision || {};
  let pageScope = null;

  if (isPdf && images.length > 0) {
    // Aggregate all page summaries so the model has full document context
    const pageSummaries = images
      .filter((img) => img.vision_summary)
      .map((img) => `Page ${img.page}: ${img.vision_summary}`)
      .join('\n');

    if (pageSummaries) {
      visionContext = { analysis: { summary: pageSummaries } };
    }

    // Include per-page scope when the user is viewing a specific page
    if (currentPageIndex >= 0 && images[currentPageIndex]) {
      const page = images[currentPageIndex];
      pageScope = {
        page_scope: page.page || currentPageIndex + 1,
        page_summary: page.vision_summary || '',
        total_pages: images.length,
      };
    }
  }

  const currentPage =
    currentPageIndex >= 0 && images[currentPageIndex]
      ? images[currentPageIndex]
      : null;

  return {
    text_excerpt: document.full_text || document.text_excerpt || '',
    ai_summary: document.ai_summary || '',
    vision: visionContext,
    components:
      currentPage?.ar_components ||
      document.ar?.components ||
      [],
    connections:
      currentPage?.ar_relationships?.connections ||
      document.ar?.connections ||
      document.ar?.relationships?.connections ||
      [],
    stored_name: document.storedName || '',
    ...pageScope,
  };
}

/**
 * Builds a natural-language question about a specific AR component,
 * incorporating its connections for richer context.
 *
 * @param {object} component    - The selected AR component object.
 * @param {Array}  [connections=[]] - All connections from the document.
 * @returns {string} A ready-to-submit question string.
 */
export function buildComponentQuestion(component, connections = []) {
  const related = connections
    .filter((c) => c.from === component.id || c.to === component.id)
    .map((c) =>
      c.from === component.id
        ? c.to_label || c.to
        : c.from_label || c.from
    );

  if (related.length > 0) {
    return (
      `Tell me about the "${component.label}" component. ` +
      `It is connected to: ${related.join(', ')}. ` +
      `What is its function, and how does it interact with these connected components?`
    );
  }

  return (
    `Tell me about the "${component.label}" component. ` +
    `What is its function, and how does it relate to the other components in this diagram?`
  );
}
