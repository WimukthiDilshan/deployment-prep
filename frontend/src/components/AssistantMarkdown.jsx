import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './AssistantMarkdown.css';
import {
  normalizeAssistantMath,
  restoreBrokenEquations,
} from '../utils/assistantMath';
import {
  extractVisualSegments,
  looksLikeAsciiTable,
  looksLikeMermaid,
} from '../utils/asciiDiagram';
import MermaidChart from './MermaidChart';
import ConceptBoard from './ConceptBoard';

const assistantComponents = {
  pre: ({ children }) => <div className="assistant-md-pre">{children}</div>,
  table: ({ children, ...props }) => (
    <div className="assistant-md-table-wrap">
      <table {...props}>{children}</table>
    </div>
  ),
  code({ className, children, ...props }) {
    const language = /language-(\w+)/.exec(className || '')?.[1] || '';
    const value = String(children || '').replace(/\n$/, '');
    if (language === 'mermaid' || looksLikeMermaid(value)) {
      return <MermaidChart definition={value} />;
    }
    if (looksLikeAsciiTable(value)) {
      return <ConceptBoard block={value} />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};

function MarkdownBlock({ text, canonicalEquations }) {
  const prepared = restoreBrokenEquations(
    normalizeAssistantMath(text),
    canonicalEquations
  );
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath, remarkGfm, remarkBreaks]}
      rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}
      components={assistantComponents}
    >
      {prepared}
    </ReactMarkdown>
  );
}

/**
 * @param {{
 *  children: string,
 *  className?: string,
 *  style?: import('react').CSSProperties,
 *  canonicalEquations?: string[],
 * }} props
 */
export default function AssistantMarkdown({
  children,
  className = '',
  style,
  canonicalEquations = [],
}) {
  const segments = extractVisualSegments(String(children || ''));
  return (
    <div className={`assistant-md ${className}`.trim()} style={style}>
      {segments.map((segment, index) => {
        if (segment.type === 'ascii') {
          return <ConceptBoard key={`ascii-${index}`} block={segment.content} />;
        }
        if (segment.type === 'mermaid') {
          return (
            <MermaidChart key={`mermaid-${index}`} definition={segment.content} />
          );
        }
        return (
          <MarkdownBlock
            key={`md-${index}`}
            text={segment.content}
            canonicalEquations={canonicalEquations}
          />
        );
      })}
    </div>
  );
}
