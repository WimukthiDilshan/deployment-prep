const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const AdmZip = require("adm-zip");
const cloudinary = require("../config/cloudinary");

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "bmp", "tif", "tiff", "webp"]);
const MIN_BYTES = 2048;
const MAX_IMAGES_PER_SOURCE = 40;
const EXTRACTED_FOLDER = "upload_section_subsections/extracted_images";

function normalizeZipPath(input) {
  return String(input || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function extOf(name) {
  const ext = path.posix.extname(normalizeZipPath(name)).slice(1).toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

function mimeFromExt(ext) {
  if (ext === "jpg") return "image/jpeg";
  if (ext === "tif" || ext === "tiff") return "image/tiff";
  return `image/${ext || "png"}`;
}

function resolveZipPath(baseDir, target) {
  const cleaned = normalizeZipPath(target);
  const joined = cleaned.startsWith("/")
    ? cleaned.replace(/^\/+/, "")
    : `${normalizeZipPath(baseDir)}/${cleaned}`;
  const stack = [];
  for (const part of joined.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      return resolve(result);
    });
    stream.end(buffer);
  });
}

function extractPptImages(buffer) {
  if (!buffer?.length) return [];

  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch (error) {
    console.warn("[extracted-images] PPT is not a .pptx archive:", error.message);
    return [];
  }

  const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
  const byName = new Map();
  for (const entry of entries) {
    byName.set(normalizeZipPath(entry.entryName).toLowerCase(), entry);
  }

  const mediaToSlide = new Map();
  for (const entry of entries) {
    const match = normalizeZipPath(entry.entryName).match(
      /^ppt\/slides\/_rels\/slide(\d+)\.xml\.rels$/i
    );
    if (!match) continue;
    const slideNum = Number(match[1]);
    const xml = entry.getData().toString("utf8");
    const tags = xml.match(/<Relationship\b[^>]*>/gi) || [];
    for (const tag of tags) {
      const type = /Type="([^"]+)"/i.exec(tag)?.[1] || "";
      const target = /Target="([^"]+)"/i.exec(tag)?.[1] || "";
      const isImage = /\/image/i.test(type) || IMAGE_EXT.has(extOf(target));
      if (!isImage || !target) continue;
      let resolved = resolveZipPath("ppt/slides", target);
      if (!byName.has(resolved.toLowerCase())) {
        const fallback = `ppt/media/${path.posix.basename(normalizeZipPath(target))}`;
        if (byName.has(fallback.toLowerCase())) resolved = fallback;
      }
      const key = resolved.toLowerCase();
      if (!mediaToSlide.has(key) || slideNum < mediaToSlide.get(key)) {
        mediaToSlide.set(key, slideNum);
      }
    }
  }

  const seen = new Set();
  const images = [];
  const ordered = [...mediaToSlide.entries()].sort((a, b) => a[1] - b[1]);
  for (const [key, pageNumber] of ordered) {
    if (images.length >= MAX_IMAGES_PER_SOURCE) break;
    const entry = byName.get(key);
    if (!entry) continue;
    const ext = extOf(entry.entryName);
    if (!IMAGE_EXT.has(ext)) continue;
    const data = entry.getData();
    if (!data?.length || data.length < MIN_BYTES) continue;
    const digest = crypto.createHash("sha256").update(data).digest("hex");
    if (seen.has(digest)) continue;
    seen.add(digest);
    images.push({
      buffer: data,
      source: "ppt",
      filePath: normalizeZipPath(entry.entryName),
      pageNumber,
      fileName: path.posix.basename(normalizeZipPath(entry.entryName)),
      mimeType: mimeFromExt(ext),
    });
  }

  return images;
}

function runPythonPdfImages(pdfPath, outputDirectory) {
  return new Promise((resolve, reject) => {
    const pythonExecutable = process.env.PYTHON_EXECUTABLE || "python";
    const scriptPath = path.join(__dirname, "..", "python", "extract_pdf_images.py");
    const child = spawn(pythonExecutable, [scriptPath, pdfPath, outputDirectory], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("PDF image extraction timed out"));
    }, 90000);

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
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || "PDF image extraction failed"));
        return;
      }
      try {
        const start = stdout.indexOf("{");
        const payload = start >= 0 ? stdout.slice(start) : stdout;
        resolve(JSON.parse(payload));
      } catch (_) {
        reject(new Error("Invalid PDF image extraction response"));
      }
    });
  });
}

async function extractPdfImages(buffer) {
  if (!buffer?.length) return [];

  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "lesson-pdf-images-"));
  const pdfPath = path.join(outputDirectory, "source.pdf");
  const imageDirectory = path.join(outputDirectory, "images");
  try {
    await fs.mkdir(imageDirectory, { recursive: true });
    await fs.writeFile(pdfPath, buffer);
    const parsed = await runPythonPdfImages(pdfPath, imageDirectory);
    const images = [];
    for (const item of parsed.images || []) {
      if (images.length >= MAX_IMAGES_PER_SOURCE) break;
      const fileName = path.basename(String(item.fileName || ""));
      if (!fileName) continue;
      const data = await fs.readFile(path.join(imageDirectory, fileName));
      if (!data?.length || data.length < MIN_BYTES) continue;
      images.push({
        buffer: data,
        source: "pdf",
        filePath: String(item.filePath || `pdf/${fileName}`),
        pageNumber: Number(item.pageNumber) || 0,
        fileName,
        mimeType: item.mimeType || "image/png",
      });
    }
    return images;
  } finally {
    await fs.rm(outputDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function storeExtractedImages(extracted, rollbackIds) {
  const stored = [];
  for (const img of extracted || []) {
    if (!img?.buffer?.length) continue;
    try {
      const result = await uploadBuffer(img.buffer, {
        folder: EXTRACTED_FOLDER,
        resource_type: "image",
        filename_override: img.fileName || `${img.source}-image`,
        unique_filename: true,
        use_filename: true,
      });
      stored.push({
        url: result.secure_url,
        publicId: result.public_id,
        source: img.source,
        filePath: img.filePath || "",
        pageNumber: Number(img.pageNumber) || 0,
      });
      if (Array.isArray(rollbackIds) && result.public_id) {
        rollbackIds.push(result.public_id);
      }
    } catch (error) {
      console.warn(
        "[extracted-images] Cloudinary upload skipped:",
        error.message || error
      );
    }
  }
  return stored;
}

async function extractAndStoreDocumentImages({
  pptBuffer,
  pdfBuffer,
  rollbackIds,
} = {}) {
  const extracted = [];

  if (pptBuffer?.length) {
    try {
      extracted.push(...extractPptImages(pptBuffer));
    } catch (error) {
      console.warn("[extracted-images] PPT image extraction failed:", error.message);
    }
  }

  if (pdfBuffer?.length) {
    try {
      extracted.push(...(await extractPdfImages(pdfBuffer)));
    } catch (error) {
      console.warn("[extracted-images] PDF image extraction failed:", error.message);
    }
  }

  return storeExtractedImages(extracted, rollbackIds);
}

function replaceExtractedBySource(existing, source, next) {
  const kept = (existing || []).filter((img) => img.source !== source);
  return [...kept, ...(next || [])];
}

function destroyCloudinaryImages(images) {
  for (const img of images || []) {
    if (!img?.publicId) continue;
    cloudinary.uploader.destroy(img.publicId, { resource_type: "image" }).catch(() => {});
  }
}

function mapExtractedImages(list) {
  return Array.isArray(list)
    ? list
        .filter((img) => img?.url)
        .map((img) => ({
          id: img._id || img.publicId,
          url: img.url,
          publicId: img.publicId,
          source: img.source || "",
          filePath: img.filePath || "",
          pageNumber: Number(img.pageNumber) || 0,
        }))
    : [];
}

module.exports = {
  extractPptImages,
  extractPdfImages,
  extractAndStoreDocumentImages,
  replaceExtractedBySource,
  destroyCloudinaryImages,
  mapExtractedImages,
};
