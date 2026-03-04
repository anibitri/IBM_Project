import React from 'react';

/**
 * Simple markdown renderer: bold, italic, code, bullet lists, line breaks.
 * Shared between ChatPanel and DiagramPanel.
 */
export function renderMarkdown(text) {
  if (!text) return null;
  // Split into paragraphs by double newline
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs.map((para, pi) => {
    // Check if it's a bullet list
    const lines = para.split('\n');
    const isList = lines.every((l) => /^\s*[-*•]\s/.test(l) || l.trim() === '');
    if (isList) {
      const items = lines.filter((l) => l.trim());
      return (
        <ul key={pi} className="md-list">
          {items.map((item, ii) => (
            <li key={ii}>{formatInline(item.replace(/^\s*[-*•]\s+/, ''))}</li>
          ))}
        </ul>
      );
    }
    // Regular paragraph
    return (
      <p key={pi} className="md-para">
        {lines.map((line, li) => (
          <React.Fragment key={li}>
            {li > 0 && <br />}
            {formatInline(line)}
          </React.Fragment>
        ))}
      </p>
    );
  });
}

export function formatInline(text) {
  // Process bold (**text**), then italic (*text*), then code (`text`)
  const parts = [];
  let remaining = text;
  let key = 0;
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{remaining.slice(lastIndex, match.index)}</span>);
    }
    if (match[2]) {
      parts.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4]) {
      parts.push(<code key={key++} className="md-code">{match[4]}</code>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < remaining.length) {
    parts.push(<span key={key++}>{remaining.slice(lastIndex)}</span>);
  }
  return parts.length ? parts : text;
}
