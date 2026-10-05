import { useEffect, useId, useState } from 'react';
import mermaid from 'mermaid';
import {
  detectDiagramKind,
  isMermaidErrorSvg,
  sanitizeMermaidDefinition,
} from '../utils/asciiDiagram';
import { KIND_LABEL } from '../utils/diagramKinds';
import DiagramVisual from './DiagramVisual';

let mermaidReady = false;

function ensureMermaid() {
  if (mermaidReady) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: 'dark',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    themeVariables: {
      darkMode: true,
      background: 'transparent',
      primaryColor: '#312e81',
      primaryTextColor: '#e2e8f0',
      primaryBorderColor: '#818cf8',
      lineColor: '#a5b4fc',
      secondaryColor: '#1e293b',
      tertiaryColor: '#0f172a',
      clusterBkg: '#1e293b',
      clusterBorder: '#6366f1',
      titleColor: '#f8fafc',
      nodeTextColor: '#e2e8f0',
    },
    flowchart: {
      curve: 'basis',
      htmlLabels: false,
      padding: 12,
    },
  });
  mermaidReady = true;
}

function removeMermaidArtifacts(id) {
  if (typeof document === 'undefined') return;
  const prefixes = [id, `d${id}`];
  for (const prefix of prefixes) {
    document.getElementById(prefix)?.remove();
    document.querySelectorAll(`[id^="${prefix}"]`).forEach((el) => {
      if (el.closest('.assistant-md-mermaid')) return;
      el.remove();
    });
  }
  document.querySelectorAll('body > svg, body > div').forEach((el) => {
    if (/Syntax error in text/i.test(el.textContent || '')) el.remove();
  });
}

export default function MermaidChart({ definition }) {
  const reactId = useId().replace(/:/g, '');
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(false);
  const kind = detectDiagramKind(definition);

  useEffect(() => {
    let cancelled = false;
    const source = sanitizeMermaidDefinition(definition);
    if (!source) {
      setSvg('');
      setError(false);
      return undefined;
    }

    ensureMermaid();
    const id = `mmd${reactId}${Math.random().toString(36).slice(2, 8)}`;

    mermaid
      .render(id, source)
      .then((result) => {
        removeMermaidArtifacts(id);
        if (cancelled) return;
        if (!result?.svg || isMermaidErrorSvg(result.svg)) {
          setSvg('');
          setError(true);
          return;
        }
        setError(false);
        setSvg(result.svg);
      })
      .catch(() => {
        removeMermaidArtifacts(id);
        if (!cancelled) {
          setSvg('');
          setError(true);
        }
      });

    return () => {
      cancelled = true;
      removeMermaidArtifacts(id);
    };
  }, [definition, reactId]);

  if (svg) {
    return (
      <figure className={`assistant-md-mermaid assistant-md-mermaid--${kind} diagram-visual`}>
        <figcaption>{KIND_LABEL[kind] || 'Diagram'}</figcaption>
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </figure>
    );
  }
  if (error) {
    return <DiagramVisual definition={definition} kind={kind} />;
  }
  if (!String(definition || '').trim()) return null;
  return <p className="assistant-md-mermaid-loading">Drawing diagram…</p>;
}
