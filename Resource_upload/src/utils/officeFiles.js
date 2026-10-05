const path = require("path");
const cloudinary = require("../config/cloudinary");

const PPT_EXTS = new Set([".ppt", ".pptx"]);

function originalOfficeFileName(kind, originalName) {
  const base = path.basename(String(originalName || "").trim());
  const ext = path.extname(base).toLowerCase();
  if (kind === "ppt") {
    if (base && PPT_EXTS.has(ext)) return base;
    return "lesson.pptx";
  }
  if (base && ext === ".pdf") return base;
  return "lesson.pdf";
}

function mimeForFileName(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".ppt") return "application/vnd.ms-powerpoint";
  if (ext === ".pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  return "application/octet-stream";
}

function contentDispositionAttachment(fileName) {
  const safe = String(fileName || "download")
    .replace(/[/\\]/g, "")
    .replace(/"/g, "")
    .slice(0, 180);
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_") || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function rawPublicId(originalName) {
  const fileName = path.basename(String(originalName || "file"));
  const ext = path.extname(fileName).toLowerCase();
  const stem = path
    .basename(fileName, ext)
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "lesson";
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  // Keep the extension out of the public_id so Cloudinary does not treat
  // .ppt/.pptx/.pdf as a delivery format and convert the original bytes.
  return `${stem}_${unique}`;
}

function uploadRawDocument(buffer, folder, originalName) {
  const publicId = rawPublicId(originalName);
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "raw",
        public_id: publicId,
        use_filename: false,
        unique_filename: false,
      },
      (err, result) => {
        if (err) return reject(err);
        return resolve(result);
      }
    );
    stream.end(buffer);
  });
}

function fileNameFromStoredUrl(url, fallback) {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const base = path.posix.basename(pathname);
    if (base && path.extname(base)) return base;
  } catch (_) {
    // ignore malformed Cloudinary URLs
  }
  return fallback;
}

function sniffOfficeFileName(buffer, kind, preferredName) {
  if (preferredName && path.extname(preferredName)) return preferredName;
  const head = Buffer.isBuffer(buffer) ? buffer.subarray(0, 8) : Buffer.alloc(0);
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isOle = head[0] === 0xd0 && head[1] === 0xcf;
  if (kind === "pdf" || isPdf) return "lesson.pdf";
  if (isOle) return "lesson.ppt";
  if (isZip) return "lesson.pptx";
  return kind === "ppt" ? "lesson.pptx" : "lesson.pdf";
}

function looksLikeHtmlOrJson(buffer) {
  const head = Buffer.isBuffer(buffer)
    ? buffer.subarray(0, 80).toString("utf8").toLowerCase().trim()
    : "";
  return (
    head.startsWith("{") ||
    head.startsWith("[") ||
    head.includes("<!doctype") ||
    head.includes("<html")
  );
}

function isOriginalDocumentBuffer(buffer, kind) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5 || looksLikeHtmlOrJson(buffer)) {
    return false;
  }
  const isPdf =
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46;
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
  const isOle = buffer[0] === 0xd0 && buffer[1] === 0xcf;
  if (kind === "pdf") return isPdf;
  return isZip || isOle;
}

function forceRawUploadUrl(url) {
  return String(url || "")
    .replace("/image/upload/", "/raw/upload/")
    .replace("/auto/upload/", "/raw/upload/");
}

function attachmentUrl(url) {
  const source = forceRawUploadUrl(url);
  if (!source.includes("/upload/") || source.includes("fl_attachment")) {
    return "";
  }
  return source.replace("/upload/", "/upload/fl_attachment/");
}

async function fetchOneBuffer(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Lumora-LessonFile/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to download stored file (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("Downloaded empty file");
  }
  if (looksLikeHtmlOrJson(buffer)) {
    throw new Error("Downloaded HTML instead of a file");
  }
  return buffer;
}

function publicIdFromStoredUrl(url) {
  try {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const match = pathname.match(
      /\/(?:raw|image|auto)\/upload\/(?:[^/]+\/)*v\d+\/(.+)$/
    );
    return match ? match[1] : "";
  } catch (_) {
    return "";
  }
}

function cloudinaryPrivateRawUrl(publicId, fileName) {
  if (!publicId) return "";
  const ext = path.extname(String(fileName || "")).replace(/^\./, "").toLowerCase();
  return cloudinary.utils.private_download_url(publicId, ext, {
    resource_type: "raw",
    type: "upload",
    attachment: true,
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
}

function cloudinaryRawAttachmentUrl(publicId, fileName) {
  if (!publicId) return "";
  return cloudinary.url(publicId, {
    resource_type: "raw",
    type: "upload",
    secure: true,
    sign_url: true,
    flags: "attachment",
    attachment: fileName || undefined,
  });
}

async function fetchOriginalOfficeFile({ storedUrl, publicId, fileName, kind }) {
  const resolvedPublicId = publicId || publicIdFromStoredUrl(storedUrl);
  const candidates = [];
  const privateUrl = cloudinaryPrivateRawUrl(resolvedPublicId, fileName);
  if (privateUrl) candidates.push(privateUrl);
  const signedUrl = cloudinaryRawAttachmentUrl(resolvedPublicId, fileName);
  if (signedUrl) candidates.push(signedUrl);
  if (storedUrl) {
    candidates.push(storedUrl);
    const rawUrl = forceRawUploadUrl(storedUrl);
    if (rawUrl && rawUrl !== storedUrl) candidates.push(rawUrl);
    const attached = attachmentUrl(storedUrl);
    if (attached) candidates.push(attached);
  }

  let lastError = new Error("No file URL");
  const seen = new Set();
  for (const url of candidates) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const buffer = await fetchOneBuffer(url);
      if (!isOriginalDocumentBuffer(buffer, kind)) {
        lastError = new Error("Downloaded content was not the original document");
        continue;
      }
      return buffer;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

module.exports = {
  originalOfficeFileName,
  mimeForFileName,
  contentDispositionAttachment,
  uploadRawDocument,
  fileNameFromStoredUrl,
  sniffOfficeFileName,
  fetchOriginalOfficeFile,
};
