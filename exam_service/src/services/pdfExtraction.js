const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const extractionScript = path.resolve(__dirname, '../python/extract_pdf.py');

async function extractPdf(filePath) {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'exam-pdf-'));
  try {
    const python = process.env.PYTHON_EXECUTABLE || (process.platform === 'win32' ? 'python' : 'python3');
    const chunkSize = String(Number(process.env.PDF_CHUNK_SIZE || 1200));
    const overlap = String(Number(process.env.PDF_CHUNK_OVERLAP || 150));
    const { stdout } = await execFileAsync(
      python,
      [extractionScript, path.resolve(filePath), outputDirectory, '--chunk-size', chunkSize, '--overlap', overlap],
      { maxBuffer: 50 * 1024 * 1024, windowsHide: true }
    );
    const result = JSON.parse(stdout);
    result.images = await Promise.all(result.images.map(async (image) => ({
      ...image,
      data: await fs.readFile(path.join(outputDirectory, path.basename(image.fileName))),
    })));
    return result;
  } catch (error) {
    const detail = String(error.stderr || error.message || error).trim();
    throw new Error(`PDF extraction failed: ${detail}`);
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { extractPdf };
