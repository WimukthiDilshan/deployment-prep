const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateMcqs,
  quizSchema,
  validateQuiz,
} = require('../src/services/geminiMcq');

function validPayload() {
  return {
    questions: Array.from({ length: 10 }, (_, index) => ({
      question: `Question ${index + 1}?`,
      options: [`Option ${index + 1}A`, `Option ${index + 1}B`, `Option ${index + 1}C`, `Option ${index + 1}D`],
      correctAnswer: ['A', 'B', 'C', 'D'][index % 4],
      explanation: `Explanation ${index + 1}`,
    })),
  };
}

test('validateQuiz accepts exactly ten valid MCQs', () => {
  const questions = validateQuiz(validPayload());
  assert.equal(questions.length, 10);
  assert.deepEqual(questions[0].options, ['Option 1A', 'Option 1B', 'Option 1C', 'Option 1D']);
});

test('validateQuiz rejects an invalid question count and duplicate options', () => {
  assert.throws(() => validateQuiz({ questions: validPayload().questions.slice(0, 9) }), /exactly 10/);
  const payload = validPayload();
  payload.questions[0].options[3] = payload.questions[0].options[0];
  assert.throws(() => validateQuiz(payload), /duplicate options/);
});

test('generateMcqs requests schema-constrained JSON from Gemini', async (context) => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const originalModel = process.env.GEMINI_MODEL;
  context.after(() => {
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = originalKey;
    process.env.GEMINI_MODEL = originalModel;
  });

  let requestUrl;
  let requestOptions;
  global.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return new Response(JSON.stringify({
      modelVersion: 'gemini-test-version',
      candidates: [{ content: { parts: [{ text: JSON.stringify(validPayload()) }] } }],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 80, totalTokenCount: 200 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GEMINI_MODEL = 'gemini-test';
  const result = await generateMcqs({
    lessonName: 'Algorithms',
    unitNo: '1',
    cognitiveLoad: 'High',
    context: '[Page 1]\nA sorting algorithm arranges values.',
  });
  const requestBody = JSON.parse(requestOptions.body);

  assert.equal(requestUrl, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
  assert.equal(requestOptions.headers['x-goog-api-key'], 'test-key');
  assert.equal(requestBody.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(requestBody.generationConfig.responseJsonSchema, quizSchema);
  assert.match(requestBody.contents[0].parts[0].text, /sorting algorithm/);
  assert.match(requestBody.contents[0].parts[0].text, /dominant cognitive-load level.*"High"/);
  assert.equal(result.model, 'gemini-test-version');
  assert.equal(result.questions.length, 10);
  assert.equal(result.usage.totalTokenCount, 200);
});

test('generateMcqs requires a Gemini API key', async (context) => {
  const originalKey = process.env.GEMINI_API_KEY;
  context.after(() => { process.env.GEMINI_API_KEY = originalKey; });
  delete process.env.GEMINI_API_KEY;

  await assert.rejects(
    generateMcqs({ lessonName: 'Algorithms', unitNo: '1', context: 'Lesson content' }),
    /GEMINI_API_KEY must be configured/,
  );
});
