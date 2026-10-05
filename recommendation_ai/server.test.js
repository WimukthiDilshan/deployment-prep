const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateBoxPlotStats,
  createCounts,
  createStyleCounts,
  dominantLoad,
  buildEvidenceSnapshot,
  buildRecommendationPrompt,
  buildVerificationAnswerPrompt,
  evidencePathExists,
  generateGeminiRecommendation,
  normalizeVerificationQuestions,
  parseGeminiJson,
  normalizeLoadLabel,
  normalizeStyleLabel,
  recommendationFor,
  summarizeTopSignals,
} = require('./server');

test('calculates box-plot values in min, q1, median, q3, max order', () => {
  assert.deepEqual(calculateBoxPlotStats([5, 1, 4, 2, 3]), [1, 2, 3, 4, 5]);
  assert.equal(calculateBoxPlotStats([]), null);
});

test('normalizes cognitive-load labels', () => {
  assert.equal(normalizeLoadLabel(' VERY_HIGH '), 'Very High');
  assert.equal(normalizeLoadLabel('law'), 'Low');
  assert.equal(normalizeLoadLabel('moderate'), 'Medium');
  assert.equal(normalizeLoadLabel('unexpected'), 'Unknown');
});

test('creates all category counts and selects the maximum', () => {
  const counts = createCounts([
    { load_level: 'High', load_count: 7 },
    { load_level: 'very high', load_count: 3 },
    { load_level: 'Low', load_count: 2 },
  ]);

  assert.deepEqual(counts, {
    'Very Low': 0,
    Low: 2,
    Medium: 0,
    High: 7,
    'Very High': 3,
    Unknown: 0,
  });
  assert.equal(dominantLoad(counts), 'High');
});

test('uses the safer higher level when maximum counts are tied', () => {
  const counts = createCounts([
    { load_level: 'Low', load_count: 4 },
    { load_level: 'High', load_count: 4 },
  ]);
  assert.equal(dominantLoad(counts), 'High');
  assert.match(recommendationFor('High', 'Algorithms'), /Algorithms/);
});

test('does not invent a dominant level when every label is unknown', () => {
  const counts = createCounts([{ load_level: 'unexpected', load_count: 5 }]);
  assert.equal(dominantLoad(counts), 'Unknown');
});

test('normalizes cognitive styles and counts only the latest profile per student', () => {
  assert.equal(normalizeStyleLabel('Moderate/Intermediatory'), 'Intermediate');
  assert.equal(normalizeStyleLabel('visual'), 'Visual');
  assert.deepEqual(createStyleCounts([
    { student_id: '1', lesson_id: 'a', cognitive_style: 'Visual' },
    { student_id: '1', lesson_id: 'b', cognitive_style: 'Verbal' },
    { student_id: '2', lesson_id: 'a', cognitive_style: 'Moderate/Intermediatory' },
  ]), { Visual: 1, Verbal: 0, Intermediate: 1, Unknown: 0 });
});

test('ranks recurring LIME and SHAP signals for class evidence', () => {
  const signals = summarizeTopSignals([
    { top_1_signal: 'pause_frequency', top_1_normalized_value: 0.8, top_2_signal: 'rewatch_segments', top_2_normalized_value: 0.4 },
    { top_1_signal: 'pause_frequency', top_1_normalized_value: 0.6, top_2_signal: 'time_on_content', top_2_normalized_value: 0.5 },
  ]);
  assert.equal(signals[0].signal, 'pause_frequency');
  assert.equal(signals[0].occurrences, 2);
  assert.equal(signals[0].averageImportance, 0.7);
});

test('builds a grounded recommendation prompt while retaining baseline support', () => {
  const counts = { 'Very Low': 0, Low: 1, Medium: 2, High: 5, 'Very High': 2, Unknown: 0 };
  const evidence = buildEvidenceSnapshot({
    course: { courseName: 'Algorithms', sections: [] },
    lessonIds: ['course-1'],
    counts,
    boxPlotData: [{ x: 'High', y: [1, 2, 3, 4, 5], observations: 5 }],
    commonSignals: [{ signal: 'pause_frequency', occurrences: 4, averageImportance: 0.6 }],
    styleCounts: { Visual: 3, Verbal: 2, Intermediate: 1, Unknown: 0 },
  });
  const prompt = buildRecommendationPrompt(evidence);
  assert.equal(evidence.cognitiveLoad.highOrVeryHighPercentage, 70);
  assert.equal(evidence.cognitiveLoad.aggregationUnit, 'one final result per student per lesson');
  assert.match(prompt, /exactly three numbered actions/);
  assert.match(prompt, /pause_frequency/);
  assert.match(recommendationFor('High', 'Algorithms'), /Algorithms/);
});

test('parses fenced JSON and requires at least three CoVe questions', () => {
  assert.deepEqual(parseGeminiJson('```json\n{"supported":true}\n```', 'test'), { supported: true });
  assert.throws(() => normalizeVerificationQuestions({
    questions: [{ id: 'q1', draftClaim: 'A claim', question: 'Is it supported?' }],
  }), /enough valid verification questions/);
});

test('keeps each CoVe answer independent from the full draft', () => {
  const prompt = buildVerificationAnswerPrompt({
    id: 'q1',
    draftClaim: 'The lesson was difficult.',
    question: 'Does the evidence state that the lesson was difficult?',
  }, { cognitiveLoad: { dominant: 'High' } });
  assert.doesNotMatch(prompt, /The lesson was difficult\./);
  assert.doesNotMatch(prompt, /Draft recommendation:/);
  assert.match(prompt, /Original evidence:/);
});

test('requires supported CoVe answers to cite a real evidence path', () => {
  const evidence = { cognitiveLoad: { counts: { High: 5 } }, commonSignals: [{ signal: 'pause_frequency' }] };
  assert.equal(evidencePathExists(evidence, 'cognitiveLoad.counts.High'), true);
  assert.equal(evidencePathExists(evidence, 'evidence.commonSignals[0].signal'), true);
  assert.equal(evidencePathExists(evidence, 'cognitiveLoad.cause'), false);
});

test('runs the complete four-stage Chain-of-Verification flow', async () => {
  const draft = 'The class evidence indicates a high cognitive-load pattern. The next lesson should use a recap, staged examples, and understanding checks before independent practice.';
  const finalRecommendation = 'The class evidence shows that High is the dominant cognitive-load category and that 70% of classified results are High or Very High. 1. Begin with a concise prerequisite recap because the observed load pattern indicates that additional support is appropriate. 2. Model one task in small stages, then pause for a short understanding check before students continue. 3. Use a brief guided practice activity and review responses before moving to independent work, while avoiding assumptions about why the observed pattern occurred.';
  const queuedResponses = [
    draft,
    JSON.stringify({ questions: [
      { id: 'q1', draftClaim: 'High is dominant.', question: 'Does the evidence show High is dominant?' },
      { id: 'q2', draftClaim: '70% are High or Very High.', question: 'Does the evidence report 70% High or Very High?' },
      { id: 'q3', draftClaim: 'The lesson was difficult.', question: 'Does the evidence state that the lesson was difficult?' },
    ] }),
    JSON.stringify({ supported: true, answer: 'High is dominant.', evidencePaths: ['cognitiveLoad.dominant'], reason: 'Direct match.' }),
    JSON.stringify({ supported: true, answer: 'The percentage is 70.', evidencePaths: ['cognitiveLoad.highOrVeryHighPercentage'], reason: 'Direct match.' }),
    JSON.stringify({ supported: false, answer: 'No cause is supplied.', evidencePaths: [], reason: 'No lesson-difficulty evidence.' }),
    JSON.stringify({ recommendation: finalRecommendation, fullyGrounded: true, removedUnsupportedClaims: ['The lesson was difficult.'] }),
  ];
  const calls = [];
  const fakeCaller = async (request) => {
    calls.push(request);
    return queuedResponses.shift();
  };
  const result = await generateGeminiRecommendation({
    cognitiveLoad: { dominant: 'High', highOrVeryHighPercentage: 70 },
  }, fakeCaller);

  assert.equal(result.text, finalRecommendation);
  assert.equal(result.verification.status, 'verified');
  assert.equal(result.verification.questionCount, 3);
  assert.equal(result.verification.unsupportedClaimCount, 1);
  assert.equal(calls.length, 6);
  assert.equal(calls.filter((call) => call.systemInstruction.includes('independent evidence verifier')).length, 3);
});

test('rejects a CoVe final response that is not fully grounded', async () => {
  const responses = [
    'This draft recommendation is deliberately long enough to pass the initial completeness validation before verification begins.',
    JSON.stringify({ questions: [
      { id: 'q1', draftClaim: 'Claim one', question: 'Is claim one supported?' },
      { id: 'q2', draftClaim: 'Claim two', question: 'Is claim two supported?' },
      { id: 'q3', draftClaim: 'Claim three', question: 'Is claim three supported?' },
    ] }),
    JSON.stringify({ supported: true, answer: 'Yes', evidencePaths: ['a'], reason: 'Match' }),
    JSON.stringify({ supported: true, answer: 'Yes', evidencePaths: ['b'], reason: 'Match' }),
    JSON.stringify({ supported: false, answer: 'No', evidencePaths: [], reason: 'Missing' }),
    JSON.stringify({ recommendation: 'Unsupported final response that must not be used as the recommendation even when it is returned.', fullyGrounded: false, removedUnsupportedClaims: [] }),
  ];
  await assert.rejects(
    generateGeminiRecommendation({ a: 1, b: 2 }, async () => responses.shift()),
    /fully grounded recommendation/,
  );
});
