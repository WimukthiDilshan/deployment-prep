import { useEffect, useMemo, useState } from 'react';
import AssistantMarkdown from './AssistantMarkdown';

const TARGET_PAGE_CHARS = 1550;

function tokenizeMarkdownBlocks(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '$$') {
      const chunk = [line];
      i += 1;
      while (i < lines.length) {
        chunk.push(lines[i]);
        if (lines[i].trim() === '$$') {
          i += 1;
          break;
        }
        i += 1;
      }
      blocks.push(chunk.join('\n'));
      continue;
    }

    if (line.trim().startsWith('```')) {
      const chunk = [line];
      i += 1;
      while (i < lines.length) {
        chunk.push(lines[i]);
        if (lines[i].trim().startsWith('```')) {
          i += 1;
          break;
        }
        i += 1;
      }
      blocks.push(chunk.join('\n'));
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      const chunk = [line];
      i += 1;
      while (i < lines.length) {
        const next = lines[i];
        if (/^#{1,6}\s/.test(next)) break;
        if (next.trim() === '$$' || next.trim().startsWith('```')) break;
        chunk.push(next);
        i += 1;
      }
      blocks.push(chunk.join('\n').trimEnd());
      continue;
    }

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    const chunk = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i];
      if (next.trim() === '') break;
      if (/^#{1,6}\s/.test(next)) break;
      if (next.trim() === '$$' || next.trim().startsWith('```')) break;
      chunk.push(next);
      i += 1;
    }
    blocks.push(chunk.join('\n'));
  }

  return blocks;
}

function splitLongProse(block, targetLen) {
  const sentences = block.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  if (sentences.length <= 1) {
    const parts = [];
    for (let i = 0; i < block.length; i += targetLen) {
      parts.push(block.slice(i, i + targetLen));
    }
    return parts;
  }
  const parts = [];
  let piece = '';
  for (const sentence of sentences) {
    if (piece && piece.length + sentence.length + 1 > targetLen) {
      parts.push(piece.trim());
      piece = sentence;
    } else {
      piece = piece ? `${piece} ${sentence}` : sentence;
    }
  }
  if (piece.trim()) parts.push(piece.trim());
  return parts;
}

export function splitIntoReadablePages(text, targetLen = TARGET_PAGE_CHARS) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [''];
  if (raw.length <= targetLen) return [raw];

  const blocks = tokenizeMarkdownBlocks(raw);
  const pages = [];
  let current = [];
  let size = 0;

  const flush = () => {
    const next = current.join('\n\n').trim();
    if (next) pages.push(next);
    current = [];
    size = 0;
  };

  const pushChunk = (chunk) => {
    if (size && size + chunk.length + 2 > targetLen) flush();
    current.push(chunk);
    size += chunk.length + 2;
  };

  for (const block of blocks) {
    const isProtected =
      block.trim().startsWith('$$') || block.trim().startsWith('```');
    if (!isProtected && block.length > targetLen * 1.45) {
      splitLongProse(block, targetLen).forEach(pushChunk);
    } else {
      pushChunk(block);
    }
  }
  flush();
  return pages.length ? pages : [raw];
}

export default function PaginatedAssistantContent({
  text,
  canonicalEquations = [],
  className = '',
}) {
  const pages = useMemo(() => splitIntoReadablePages(text), [text]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [text]);

  const safePage = Math.min(Math.max(page, 0), Math.max(pages.length - 1, 0));
  const current = pages[safePage] || '';

  return (
    <div className={`paginated-md ${className}`.trim()}>
      <AssistantMarkdown canonicalEquations={canonicalEquations}>
        {current}
      </AssistantMarkdown>
      {pages.length > 1 ? (
        <nav className="paginated-md__nav" aria-label="Personalized content pages">
          <button
            type="button"
            className="paginated-md__btn"
            disabled={safePage === 0}
            onClick={() => setPage((prev) => Math.max(0, prev - 1))}
          >
            Previous
          </button>
          <p className="paginated-md__status">
            Page {safePage + 1} of {pages.length}
          </p>
          <button
            type="button"
            className="paginated-md__btn"
            disabled={safePage === pages.length - 1}
            onClick={() => setPage((prev) => Math.min(pages.length - 1, prev + 1))}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
