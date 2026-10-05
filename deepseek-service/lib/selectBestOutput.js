const {
  computeFleschReadingEase,
  readabilityMatchScore,
} = require("./readability");
const { faithfulnessScores } = require("./similarity");

/**
 * Select the better of two model outputs for the student.
 *
 * Composite score (defense rationale):
 *   composite = 0.65 * faithfulness + 0.35 * readabilityMatch
 *
 * Faithfulness is weighted higher because inventing facts (hallucination)
 * is more harmful than slightly mistuned reading difficulty.
 *
 * If embeddings fail, we degrade to readability-only ranking and attach a warning.
 */

const FAITHFULNESS_WEIGHT = 0.65;
const READABILITY_WEIGHT = 0.35;

function scoreOneOutput({
  model,
  text,
  faithfulness,
  cognitiveLoadLevel,
  faithfulnessAvailable,
}) {
  const readability = computeFleschReadingEase(text);
  const { targetFlesch, readabilityMatch } = readabilityMatchScore(
    readability.fleschReadingEase,
    cognitiveLoadLevel
  );

  let composite;
  let weightsUsed;

  if (faithfulnessAvailable) {
    composite =
      FAITHFULNESS_WEIGHT * faithfulness +
      READABILITY_WEIGHT * readabilityMatch;
    weightsUsed = {
      faithfulness: FAITHFULNESS_WEIGHT,
      readabilityMatch: READABILITY_WEIGHT,
    };
  } else {
    // Graceful degradation: do not crash; rank by readability fit only.
    composite = readabilityMatch;
    weightsUsed = {
      faithfulness: 0,
      readabilityMatch: 1,
    };
  }

  return {
    model,
    text,
    faithfulness: faithfulnessAvailable ? faithfulness : null,
    fleschReadingEase: readability.fleschReadingEase,
    targetFlesch,
    readabilityMatch,
    composite: Number(composite.toFixed(4)),
    weightsUsed,
    readabilityStats: {
      words: readability.words,
      sentences: readability.sentences,
      syllables: readability.syllables,
    },
  };
}

/**
 * @param {{
 *  sourceContent: string,
 *  gptOutput: string,
 *  deepseekOutput: string,
 *  cognitiveLoadLevel?: string
 * }} input
 */
async function selectBestOutput(input) {
  const sourceContent = String(input.sourceContent || "").trim();
  const gptOutput = String(input.gptOutput || "").trim();
  const deepseekOutput = String(input.deepseekOutput || "").trim();
  const cognitiveLoadLevel = String(input.cognitiveLoadLevel || "Medium").trim();

  const available = [];
  if (gptOutput) available.push({ model: "huggingface", text: gptOutput });
  if (deepseekOutput) available.push({ model: "deepseek", text: deepseekOutput });

  if (available.length === 0) {
    return {
      success: false,
      message: "No model outputs provided to compare.",
    };
  }

  // Only one model succeeded → that output is the automatic winner.
  if (available.length === 1) {
    const only = available[0];
    const scored = scoreOneOutput({
      model: only.model,
      text: only.text,
      faithfulness: null,
      cognitiveLoadLevel,
      faithfulnessAvailable: false,
    });
    const result = {
      success: true,
      selectedModel: only.model,
      selectedText: only.text,
      reason: "Only one model returned an output.",
      faithfulnessMethod: "skipped",
      warning: "Single-output selection; cross-check skipped.",
      scores: {
        huggingface: only.model === "huggingface" ? scored : null,
        deepseek: only.model === "deepseek" ? scored : null,
      },
    };
    console.log("\n========== SELECT-BEST REASONING ==========");
    console.log("Only one output available:", only.model);
    console.log(scored);
    console.log("WINNER:", only.model);
    console.log("==========================================\n");
    return result;
  }

  const { scores: faithScores, method, warning } = await faithfulnessScores(
    sourceContent,
    [gptOutput, deepseekOutput]
  );

  const faithfulnessAvailable =
    method === "hf_embeddings" || method === "sparse_tf_cosine_fallback";

  // If source was empty, sparse method still runs but is weak — prefer readability emphasis.
  const useFaithfulness = Boolean(sourceContent) && faithfulnessAvailable;

  if (!useFaithfulness) {
    console.warn(
      "[select-best] Faithfulness unavailable or source empty; ranking by readability match only."
    );
  }

  const gptScore = scoreOneOutput({
    model: "huggingface",
    text: gptOutput,
    faithfulness: faithScores[0],
    cognitiveLoadLevel,
    faithfulnessAvailable: useFaithfulness,
  });

  const deepseekScore = scoreOneOutput({
    model: "deepseek",
    text: deepseekOutput,
    faithfulness: faithScores[1],
    cognitiveLoadLevel,
    faithfulnessAvailable: useFaithfulness,
  });

  const winner =
    deepseekScore.composite > gptScore.composite ? deepseekScore : gptScore;

  // Tie-break: prefer higher faithfulness when composites are equal.
  let selected = winner;
  if (gptScore.composite === deepseekScore.composite) {
    const gptFaith = gptScore.faithfulness ?? -1;
    const dsFaith = deepseekScore.faithfulness ?? -1;
    selected = dsFaith > gptFaith ? deepseekScore : gptScore;
  }

  const result = {
    success: true,
    selectedModel: selected.model,
    selectedText: selected.text,
    reason:
      selected.model === "huggingface"
        ? "Hugging Face output won on composite score (faithfulness + readability fit)."
        : "DeepSeek output won on composite score (faithfulness + readability fit).",
    faithfulnessMethod: useFaithfulness ? method : "readability_only_fallback",
    warning: warning || (!useFaithfulness
      ? "Ranked using readability match only (faithfulness skipped or unavailable)."
      : null),
    weights: useFaithfulness
      ? { faithfulness: FAITHFULNESS_WEIGHT, readabilityMatch: READABILITY_WEIGHT }
      : { faithfulness: 0, readabilityMatch: 1 },
    scores: {
      huggingface: gptScore,
      deepseek: deepseekScore,
    },
  };

  // Server-side reasoning log (visible in deepseek-service terminal)
  console.log("\n========== SELECT-BEST REASONING ==========");
  console.log("Cognitive load:", cognitiveLoadLevel);
  console.log("Faithfulness method:", result.faithfulnessMethod);
  console.log("Weights:", result.weights);
  if (result.warning) console.warn("Warning:", result.warning);
  console.log("Hugging Face:", {
    faithfulness: gptScore.faithfulness,
    fleschReadingEase: gptScore.fleschReadingEase,
    targetFlesch: gptScore.targetFlesch,
    readabilityMatch: gptScore.readabilityMatch,
    composite: gptScore.composite,
  });
  console.log("DeepSeek:", {
    faithfulness: deepseekScore.faithfulness,
    fleschReadingEase: deepseekScore.fleschReadingEase,
    targetFlesch: deepseekScore.targetFlesch,
    readabilityMatch: deepseekScore.readabilityMatch,
    composite: deepseekScore.composite,
  });
  console.log(
    "WINNER:",
    selected.model,
    "| composite:",
    selected.composite,
    "|",
    result.reason
  );
  console.log("==========================================\n");

  return result;
}

module.exports = {
  selectBestOutput,
  FAITHFULNESS_WEIGHT,
  READABILITY_WEIGHT,
};
