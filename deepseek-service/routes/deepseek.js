const express = require("express");
const axios = require("axios");
const verifyToken = require("../middleware/verifyToken");
const { selectBestOutput } = require("../lib/selectBestOutput");

const router = express.Router();

const DEFAULT_SYSTEM =
  "You are a helpful educational assistant. Explain clearly, keep answers practical, and support content conversion and learning.";

function getDeepseekConfig() {
  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  const baseUrl = String(
    process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com"
  )
    .trim()
    .replace(/\/$/, "")
    .replace(/\/v1$/i, "");
  const model = String(
    process.env.DEEPSEEK_MODEL || "deepseek-v4-flash"
  ).trim();
  return { apiKey, baseUrl, model };
}

function modelCandidates(preferred) {
  const defaults = ["deepseek-v4-flash", "deepseek-v4-pro"];
  return [preferred, ...defaults].filter(
    (name, index, list) => Boolean(name) && list.indexOf(name) === index
  );
}

function textFrom(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((part) => textFrom(part)).join("");
  }
  if (typeof value === "object") {
    return (
      textFrom(value.text) ||
      textFrom(value.content) ||
      textFrom(value.value) ||
      ""
    );
  }
  return "";
}

function extractAnswer(payload) {
  const choice = payload?.choices?.[0] || {};
  const message = choice.message || {};
  return (
    textFrom(message.content) ||
    textFrom(message.reasoning_content) ||
    textFrom(message.reasoning) ||
    textFrom(choice.text) ||
    textFrom(choice.content) ||
    textFrom(payload?.output_text) ||
    ""
  ).trim();
}

function shouldTryNextStatus(status) {
  return status === 400 || status === 404 || status === 422;
}

async function callDeepseekChat(messages, { maxTokens = 8192 } = {}) {
  const { apiKey, baseUrl, model } = getDeepseekConfig();
  if (!apiKey) {
    const error = new Error("DEEPSEEK_API_KEY is not configured.");
    error.status = 500;
    throw error;
  }

  const bodyVariants = [
    { thinking: { type: "disabled" } },
    {},
  ];

  let lastFailure = null;
  for (const candidate of modelCandidates(model)) {
    for (const extraBody of bodyVariants) {
      let response;
      try {
        response = await axios.post(
          `${baseUrl}/chat/completions`,
          {
            model: candidate,
            messages,
            max_tokens: maxTokens,
            temperature: 0.7,
            stream: false,
            ...extraBody,
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            timeout: 180000,
            validateStatus: () => true,
          }
        );
      } catch (networkError) {
        lastFailure = {
          status: 502,
          detail: `${candidate}: ${networkError.message || "network error"}`,
        };
        console.warn("[deepseek]", lastFailure.detail);
        continue;
      }

      if (response.status >= 400) {
        const detail =
          response.data?.error?.message ||
          (typeof response.data?.error === "string"
            ? response.data.error
            : JSON.stringify(response.data));
        lastFailure = {
          status: response.status,
          detail: `${candidate}: ${detail || "DeepSeek request failed."}`,
        };
        console.warn("[deepseek]", lastFailure.detail);
        if (shouldTryNextStatus(response.status)) {
          continue;
        }
        const error = new Error(lastFailure.detail);
        error.status = 502;
        error.detail = lastFailure.detail;
        throw error;
      }

      const answer = extractAnswer(response.data);
      if (answer) {
        console.log(
          "[deepseek] ok",
          candidate,
          "chars",
          answer.length,
          "finish",
          response.data?.choices?.[0]?.finish_reason || ""
        );
        return { answer, model: candidate };
      }
      lastFailure = {
        status: 502,
        detail: `${candidate}: empty answer payload (finish=${response.data?.choices?.[0]?.finish_reason || "unknown"})`,
      };
      console.warn("[deepseek]", lastFailure.detail);
    }
  }

  const error = new Error(
    lastFailure?.detail || "DeepSeek returned an empty answer."
  );
  error.status = 502;
  error.detail = lastFailure?.detail;
  throw error;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .map((item) => ({
      role: String(item?.role || "").trim(),
      content: String(item?.content || "").trim(),
    }))
    .filter(
      (item) =>
        item.content &&
        (item.role === "user" ||
          item.role === "assistant" ||
          item.role === "system")
    )
    .slice(-20);
}

/**
 * Frontend chat (via API gateway). Requires student/teacher JWT.
 * Body: { message: string, history?: [{ role, content }] }
 */
router.post("/chat", verifyToken, async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (!message) {
    return res.status(400).json({ message: "message is required" });
  }

  const history = normalizeHistory(req.body?.history);
  const messages = [
    { role: "system", content: DEFAULT_SYSTEM },
    ...history.filter((item) => item.role !== "system"),
    { role: "user", content: message },
  ];

  console.log("[deepseek] /chat", { messageChars: message.length });
  try {
    const { answer, model } = await callDeepseekChat(messages);
    return res.status(200).json({
      success: true,
      data: { answer, model },
    });
  } catch (error) {
    console.warn("[deepseek] /chat failed", error.message || error);
    return res.status(error.status || 500).json({
      message: error.message || "Failed to get response from DeepSeek.",
      detail: error.detail,
    });
  }
});

/**
 * Service-to-service content conversion (direct call to this service).
 * Body: { content: string, instruction?: string }
 */
router.post("/convert", async (req, res) => {
  const content = String(req.body?.content || "").trim();
  const instruction = String(
    req.body?.instruction ||
      "Convert and rewrite the following content into clear educational material."
  ).trim();

  if (!content) {
    return res.status(400).json({ message: "content is required" });
  }

  const messages = [
    {
      role: "system",
      content:
        "You convert educational content. Follow the instruction precisely and return only the converted content.",
    },
    {
      role: "user",
      content: `${instruction}\n\n---\n\n${content}`,
    },
  ];

  try {
    const { answer, model } = await callDeepseekChat(messages, {
      maxTokens: 4096,
    });
    return res.status(200).json({
      success: true,
      data: { converted: answer, model },
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Failed to convert content with DeepSeek.",
      detail: error.detail,
    });
  }
});

router.get("/health", (req, res) => {
  res.json({ ok: true, service: "deepseek-service" });
});

/**
 * Cross-check two model outputs against source content and pick the better one.
 * Body: {
 *   sourceContent, gptOutput, deepseekOutput, cognitiveLoadLevel?
 * }
 */
router.post("/select-best", verifyToken, async (req, res) => {
  try {
    const result = await selectBestOutput({
      sourceContent: req.body?.sourceContent,
      gptOutput: req.body?.gptOutput,
      deepseekOutput: req.body?.deepseekOutput,
      cognitiveLoadLevel: req.body?.cognitiveLoadLevel,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("[select-best] Unexpected error:", error);
    return res.status(500).json({
      message: "Failed to select best output.",
      detail: error?.message || String(error),
    });
  }
});

module.exports = router;
