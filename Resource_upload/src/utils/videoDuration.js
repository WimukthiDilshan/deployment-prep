const { parseBuffer } = require("music-metadata");

const MAX_VIDEO_DURATION_SEC = 15 * 60;

class VideoDurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "VideoDurationError";
    this.status = 400;
  }
}

async function readVideoDurationSec(file) {
  if (!file?.buffer?.length) return 0;

  try {
    const metadata = await parseBuffer(file.buffer, {
      mimeType: file.mimetype,
      size: file.size,
    });
    const durationSec = Number(metadata?.format?.duration);
    return Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
  } catch {
    return 0;
  }
}

/**
 * Reads duration from the uploaded video buffer and rejects clips longer than 15 minutes.
 * @returns {Promise<number>} duration in seconds
 */
async function assertVideoDurationLimit(file) {
  if (!file?.buffer?.length) return 0;

  let durationSec = 0;
  try {
    durationSec = await readVideoDurationSec(file);
  } catch (err) {
    throw new VideoDurationError(
      "Could not read video duration. Please upload a standard MP4/WebM file of 15 minutes or less."
    );
  }

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new VideoDurationError(
      "Could not determine video duration. Please upload a video of 15 minutes or less."
    );
  }

  if (durationSec > MAX_VIDEO_DURATION_SEC) {
    const minutes = Math.ceil(durationSec / 60);
    throw new VideoDurationError(
      `Video is too long (${minutes} minutes). Maximum allowed length is 15 minutes.`
    );
  }

  return durationSec;
}

module.exports = {
  MAX_VIDEO_DURATION_SEC,
  VideoDurationError,
  readVideoDurationSec,
  assertVideoDurationLimit,
};
