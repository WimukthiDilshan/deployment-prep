const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { fetchRemoteBuffer } = require("./lessonExtract.service");

const MEDIA_EXTS = new Set([
  ".mp4",
  ".webm",
  ".mov",
  ".mkv",
  ".avi",
  ".mpeg",
  ".mpg",
  ".m4a",
  ".mp3",
  ".wav",
]);

function whisperFileName(originalName) {
  const ext = path.extname(String(originalName || "")).toLowerCase();
  if (MEDIA_EXTS.has(ext)) return originalName;
  return "lesson.mp4";
}

const runWhisperTranscription = (videoBuffer, originalName) =>
  new Promise(async (resolve, reject) => {
    const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";
    const whisperModel = process.env.WHISPER_MODEL || "base";
    const extension = path.extname(whisperFileName(originalName));
    const tempFilePath = path.join(
      os.tmpdir(),
      `upload-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`
    );

    try {
      await fs.writeFile(tempFilePath, videoBuffer);

      const scriptPath = path.join(
        __dirname,
        "..",
        "python",
        "transcribe_audio.py"
      );

      const pythonProcess = spawn(pythonExecutable, [
        scriptPath,
        tempFilePath,
        whisperModel,
      ]);

      let stdout = "";
      let stderr = "";

      pythonProcess.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      pythonProcess.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      pythonProcess.on("close", async (code) => {
        try {
          await fs.unlink(tempFilePath);
        } catch (_) {
          // Ignore cleanup errors for temp files.
        }

        if (code !== 0) {
          return reject(
            new Error(stderr.trim() || "Python transcription process failed")
          );
        }

        try {
          const parsed = JSON.parse(stdout);
          return resolve({
            text: parsed.text || "",
            chunks: Array.isArray(parsed.chunks) ? parsed.chunks : [],
          });
        } catch (_) {
          return reject(new Error("Invalid transcription response from Python"));
        }
      });
    } catch (error) {
      try {
        await fs.unlink(tempFilePath);
      } catch (_) {
        // Ignore cleanup errors for temp files.
      }
      return reject(error);
    }
  });

async function runWhisperFromUrl(fileUrl, originalName = "lesson.mp4") {
  const buffer = await fetchRemoteBuffer(fileUrl);
  if (!buffer.length) {
    return { text: "", chunks: [] };
  }
  return runWhisperTranscription(buffer, whisperFileName(originalName));
}

module.exports = {
  runWhisperTranscription,
  runWhisperFromUrl,
};
