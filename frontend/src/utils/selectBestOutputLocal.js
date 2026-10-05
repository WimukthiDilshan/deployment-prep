/**
 * Browser-side fallback when /api/deepseek/select-best is unavailable (e.g. 404).
 * Mirrors the server logic with lexical faithfulness + Flesch readability match.
 */

function countSyllables(word) {
  const w = String(word || '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const m = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
}

function fleschReadingEase(text) {
  const words = String(text || '')
    .toLowerCase()
    .match(/[a-zA-Z']+/g) || [];
  const sentences = String(text || "")
    .replace(/\s+/g, ' ')
    .trim()
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const wordCount = Math.max(words.length, 1);
  const sentenceCount = Math.max(sentences.length, 1);
  const syllableCount = Math.max(
    words.reduce((sum, w) => sum + countSyllables(w), 0),
    1
  );
  const fre = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syllableCount / wordCount);
  return Number(fre.toFixed(2));
}

function targetFleschForLoad(level) {
  const map = { 'Very High': 75, High: 65, Medium: 55, Low: 45 };
  return map[String(level || 'Medium')] ?? 55;
}

function readabilityMatch(fre, level) {
  const target = targetFleschForLoad(level);
  const match = 1 - Math.min(1, Math.abs(fre - target) / 50);
  return { targetFlesch: target, readabilityMatch: Number(match.toFixed(4)) };
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function lexicalFaithfulness(source, candidate) {
  const a = new Set(tokenize(source));
  const b = new Set(tokenize(candidate));
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return Number((inter / Math.max(union, 1)).toFixed(4));
}

function scoreOutput(model, text, source, loadLevel) {
  const fre = fleschReadingEase(text);
  const { targetFlesch, readabilityMatch: rMatch } = readabilityMatch(fre, loadLevel);
  const faithfulness = lexicalFaithfulness(source, text);
  const composite = Number((0.65 * faithfulness + 0.35 * rMatch).toFixed(4));
  return {
    model,
    text,
    faithfulness,
    fleschReadingEase: fre,
    targetFlesch,
    readabilityMatch: rMatch,
    composite,
    weightsUsed: { faithfulness: 0.65, readabilityMatch: 0.35 },
  };
}

/**
 * @returns selection payload shaped like the server select-best response
 */
export function selectBestOutputLocally({
  sourceContent,
  gptOutput,
  deepseekOutput,
  cognitiveLoadLevel = 'Medium',
}) {
  const source = String(sourceContent || '').trim();
  const gpt = String(gptOutput || '').trim();
  const ds = String(deepseekOutput || '').trim();

  if (!gpt && !ds) {
    return { success: false, message: 'No outputs to compare.' };
  }

  if (!gpt || !ds) {
    const onlyModel = gpt ? 'huggingface' : 'deepseek';
    const onlyText = gpt || ds;
    const scored = scoreOutput(onlyModel, onlyText, source, cognitiveLoadLevel);
    return {
      success: true,
      selectedModel: onlyModel,
      selectedText: onlyText,
      reason: 'Only one model returned an output (local fallback).',
      faithfulnessMethod: 'local_lexical_jaccard',
      warning: 'Server select-best unavailable; used browser-side fallback.',
      weights: { faithfulness: 0.65, readabilityMatch: 0.35 },
      scores: {
        huggingface: gpt ? scored : null,
        deepseek: ds ? scored : null,
      },
    };
  }

  const hfScore = scoreOutput('huggingface', gpt, source, cognitiveLoadLevel);
  const dsScore = scoreOutput('deepseek', ds, source, cognitiveLoadLevel);
  let selected = dsScore.composite > hfScore.composite ? dsScore : hfScore;
  if (hfScore.composite === dsScore.composite) {
    selected =
      (dsScore.faithfulness ?? -1) > (hfScore.faithfulness ?? -1)
        ? dsScore
        : hfScore;
  }

  return {
    success: true,
    selectedModel: selected.model,
    selectedText: selected.text,
    reason:
      selected.model === 'huggingface'
        ? 'Hugging Face won on local composite score (faithfulness + readability).'
        : 'DeepSeek won on local composite score (faithfulness + readability).',
    faithfulnessMethod: 'local_lexical_jaccard',
    warning:
      'Server /api/deepseek/select-best was unavailable (restart deepseek-service). Used browser-side fallback.',
    weights: { faithfulness: 0.65, readabilityMatch: 0.35 },
    scores: {
      huggingface: hfScore,
      deepseek: dsScore,
    },
  };
}
