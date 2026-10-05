const FILLER = new Set([
  "you",
  "yeah",
  "uh",
  "um",
  "uhm",
  "hmm",
  "mm",
  "mmm",
  "ah",
  "oh",
  "okay",
  "ok",
  "alright",
  "allright",
  "bye",
  "goodbye",
  "thanks",
  "thank",
  "please",
  "subscribe",
  "like",
  "share",
  "music",
  "applause",
  "silence",
  "foreign",
  "subtitle",
  "subtitles",
  "caption",
  "captions",
  "watching",
]);

const NOISE_EXACT = new Set([
  "you",
  "thank you",
  "thanks",
  "thanks for watching",
  "thanks for watching this video",
  "thank you for watching",
  "please subscribe",
  "like and subscribe",
  "see you next time",
  "see you in the next video",
  "bye",
  "bye bye",
  "goodbye",
  "alright",
  "all right",
  "okay",
  "ok",
  "okay so",
  "alright so",
  "music",
  "applause",
  "silence",
]);

const NOISE_PHRASE_RE = [
  /^(thank you[\s.!?]*)+$/i,
  /^(thanks( for watching)?[\s.!?]*)+$/i,
  /^(you[\s.!?]*)+$/i,
  /^(bye[\s.!?]*)+$/i,
  /^(uh+|um+|hmm+|mm+)([\s.!?]+(uh+|um+|hmm+|mm+))*$/i,
  /^(you|u)(\s+\1){2,}$/i,
  /thanks for watching/i,
  /like and subscribe/i,
  /please subscribe/i,
  /see you (in the )?next/i,
  /^\[?(music|applause|silence|inaudible|foreign)\]?$/i,
];

const CLASSROOM_TALK_RE = [
  /\bwraps up\b/,
  /\bwrap(?:ping)? up\b/,
  /\bthats (it|all|enough) for (today|now|this|the)\b/,
  /\b(this )?(lesson|lecture|video|class|series) (is )?(over|done|finished)\b/,
  /\bnice work\b/,
  /\b(good|great|nice) (job|work|going)\b/,
  /\bgetting through( all of)? it\b/,
  /\blets (just )?(move|go|continue|wrap)( on)?\b/,
  /\bmoving on\b/,
  /\bnext (slide|one|topic|section|part|video|lesson)\b/,
  /\bhope (that )?that (was |is )?helpful\b/,
  /\bhope you (enjoyed|learned)\b/,
  /\bcatch you (later|next)\b/,
  /\bsee you (later|next|tomorrow)\b/,
  /\bdoes that make sense\b/,
  /\bany questions\b/,
];

const CLASSROOM_STOP = new Set([
  ...FILLER,
  "alright",
  "allright",
  "all",
  "right",
  "so",
  "well",
  "now",
  "yes",
  "yep",
  "hey",
  "hi",
  "hello",
  "nice",
  "good",
  "great",
  "awesome",
  "job",
  "work",
  "going",
  "go",
  "getting",
  "through",
  "of",
  "it",
  "this",
  "that",
  "these",
  "those",
  "the",
  "a",
  "an",
  "wraps",
  "wrap",
  "wrapping",
  "up",
  "lesson",
  "lessons",
  "series",
  "video",
  "videos",
  "lecture",
  "lectures",
  "class",
  "today",
  "tonight",
  "here",
  "there",
  "we",
  "i",
  "im",
  "lets",
  "let",
  "us",
  "move",
  "moving",
  "on",
  "next",
  "slide",
  "slides",
  "one",
  "part",
  "topic",
  "section",
  "chapter",
  "bit",
  "thing",
  "things",
  "everyone",
  "folks",
  "guys",
  "people",
  "students",
  "anyway",
  "actually",
  "basically",
  "really",
  "just",
  "continue",
  "start",
  "begin",
  "done",
  "over",
  "end",
  "finish",
  "finished",
  "enough",
  "last",
  "listening",
  "joining",
  "see",
  "look",
  "remember",
  "and",
  "or",
  "but",
  "to",
  "for",
  "with",
  "at",
  "in",
  "into",
  "from",
  "by",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "my",
  "our",
  "your",
  "makes",
  "make",
  "sense",
  "hope",
  "enjoyed",
  "enjoy",
  "helpful",
  "questions",
  "question",
  "any",
  "catch",
  "later",
  "tomorrow",
  "pause",
  "wait",
  "ready",
]);

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(text) {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}

function isSingleGlyphLoop(text) {
  const compact = normalize(text).replace(/\s+/g, "");
  return compact.length >= 4 && /^(.)\1+$/.test(compact);
}

function isRepeatedSameWord(tokens) {
  if (tokens.length < 3) return false;
  return tokens.every((token) => token === tokens[0]);
}

function fillerRatio(tokens) {
  if (!tokens.length) return 1;
  const fillerCount = tokens.filter((token) => FILLER.has(token)).length;
  return fillerCount / tokens.length;
}

function stripRepeatedFillerRuns(text) {
  return String(text || "")
    .replace(/\b(you|u|uh|um|uhm|yeah|mm|mmm|hmm)(\s+\1){2,}\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasLessonContent(text, tokens) {
  const sample = String(text || "");
  if (/\d/.test(sample)) return true;
  if (/\$|\\[a-z]+|[=^_]{1,2}/i.test(sample)) return true;
  return tokens.some(
    (token) => token.length >= 6 && !CLASSROOM_STOP.has(token)
  );
}

function isEmptyClassroomTalk(text, tokens) {
  const normalized = normalize(text);
  if (!normalized || !tokens.length) return true;
  if (hasLessonContent(text, tokens)) return false;
  if (CLASSROOM_TALK_RE.some((re) => re.test(normalized))) return true;
  const talkCount = tokens.filter(
    (token) => CLASSROOM_STOP.has(token) || FILLER.has(token)
  ).length;
  return tokens.length <= 14 && talkCount / tokens.length >= 0.75;
}

function isWhisperNoiseChunk(text) {
  const sample = stripRepeatedFillerRuns(text);
  if (!sample) return true;
  if (isSingleGlyphLoop(sample)) return true;

  const normalized = normalize(sample);
  if (!normalized) return true;
  if (NOISE_EXACT.has(normalized)) return true;
  if (NOISE_PHRASE_RE.some((re) => re.test(normalized))) return true;

  const tokens = tokensOf(sample);
  if (!tokens.length) return true;
  if (isRepeatedSameWord(tokens)) return true;
  if (isEmptyClassroomTalk(sample, tokens)) return true;

  const unique = new Set(tokens);
  const maxCount = Math.max(
    ...[...unique].map((word) => tokens.filter((token) => token === word).length)
  );
  const topWord = [...unique].find(
    (word) => tokens.filter((token) => token === word).length === maxCount
  );
  if (
    tokens.length >= 4 &&
    maxCount / tokens.length >= 0.7 &&
    FILLER.has(topWord)
  ) {
    return true;
  }

  if (tokens.length <= 8 && fillerRatio(tokens) >= 0.85) return true;
  if (tokens.length <= 3 && tokens.every((token) => FILLER.has(token))) return true;

  return false;
}

function splitForFilter(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function filterWhisperNoise(text) {
  const source = String(text || "").trim();
  if (!source) return "";
  const paragraphs = source.split(/\n{2,}/);
  const cleaned = paragraphs
    .map((para) =>
      splitForFilter(para)
        .map((part) => stripRepeatedFillerRuns(part))
        .filter((part) => part && !isWhisperNoiseChunk(part))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);
  return cleaned.join("\n\n");
}

module.exports = {
  isWhisperNoiseChunk,
  filterWhisperNoise,
};
