const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { PDFParse } = require("pdf-parse");
const { collectEquations } = require("../utils/mathText");
const { mapUnicode, wrapLatex } = require("./ommlToLatex");

function normalizePdfText(input) {
  return String(input || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMathPdfText(input) {
  return String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function parsePdfRawText(buffer) {
  if (!buffer || !buffer.length) return "";
  let parser;
  try {
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();
    return result?.text || "";
  } catch (error) {
    if (parser) {
      try {
        await parser.destroy();
      } catch (_) {
        // ignore parser cleanup issues
      }
    }
    console.error("PDF extraction failed:", error?.message || error);
    return "";
  }
}

async function extractPdfText(buffer) {
  return normalizePdfText(await parsePdfRawText(buffer));
}

function fallbackPdfMath(rawText) {
  const lines = normalizeMathPdfText(mapUnicode(rawText))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      if (line.startsWith("$")) return line;
      if (/[\\^_{}=]|\\frac|\\sum|\\int|\\partial|\\nabla/.test(line) && line.length <= 180) {
        return wrapLatex(line);
      }
      return line;
    });
  const text = lines.join("\n");
  return {
    text,
    equations: collectEquations(text),
  };
}

function runPythonMathPdf(buffer) {
  return new Promise(async (resolve, reject) => {
    const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";
    const tempFilePath = path.join(
      os.tmpdir(),
      `math-pdf-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`
    );
    try {
      await fs.writeFile(tempFilePath, buffer);
      const scriptPath = path.join(__dirname, "..", "python", "extract_math_pdf.py");
      const child = spawn(pythonExecutable, [scriptPath, tempFilePath]);
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("PDF math extraction timed out"));
      }, 60000);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", async (code) => {
        clearTimeout(timer);
        try {
          await fs.unlink(tempFilePath);
        } catch (_) {
          // ignore temp cleanup
        }
        if (code !== 0) {
          reject(new Error(stderr.trim() || "PDF math extraction failed"));
          return;
        }
        try {
          const parsed = JSON.parse(stdout);
          resolve({
            text: String(parsed.text || "").trim(),
            equations: Array.isArray(parsed.equations)
              ? parsed.equations.map((item) => String(item || "").trim()).filter(Boolean)
              : collectEquations(parsed.text || ""),
          });
        } catch (_) {
          reject(new Error("Invalid PDF math extraction response"));
        }
      });
    } catch (error) {
      try {
        await fs.unlink(tempFilePath);
      } catch (_) {
        // ignore temp cleanup
      }
      reject(error);
    }
  });
}

async function extractPdfMathText(buffer) {
  if (!buffer || !buffer.length) return { text: "", equations: [] };
  try {
    const result = await runPythonMathPdf(buffer);
    if (result?.text) return result;
  } catch (error) {
    console.warn(
      "[pdf-math] PyMuPDF extractor unavailable, using fallback:",
      error.message
    );
  }
  return fallbackPdfMath(await parsePdfRawText(buffer));
}

module.exports = {
  extractPdfText,
  extractPdfMathText,
};
