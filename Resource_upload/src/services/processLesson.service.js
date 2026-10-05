const CourseSubSection = require("../models/courseSubSection.model");
const SubsectionTranscriptChunk = require("../models/subsectionTranscriptChunk.model");
const {
  runWhisperTranscription,
  runWhisperFromUrl,
} = require("./transcription.service");
const {
  extractLessonDocuments,
  fetchRemoteBuffer,
  fileNameFromUrl,
} = require("./lessonExtract.service");
const {
  extractAndStoreDocumentImages,
  replaceExtractedBySource,
} = require("./documentImage.service");
const { dedupeSubsectionExtracts } = require("./semanticDedupe.service");
const {
  evaluateKnowledgeQuality,
  applyUniqueKnowledge,
} = require("./knowledgeQuality.service");
const { filterWhisperNoise } = require("./whisperNoise.service");
const { notifyLessonProcessed } = require("./pushNotification.service");
const { readVideoDurationSec } = require("../utils/videoDuration");

/** One global FIFO: never process two subsections at once, never mix their files. */
const fifo = [];
const pendingRequeue = new Map();
const courseBatches = new Map();
let activeJob = null;
let draining = false;

function asciiBar(done, total, width = 24) {
  const t = Math.max(0, Number(total) || 0);
  const d = Math.max(0, Math.min(t, Number(done) || 0));
  if (t <= 0) {
    return `[${"░".repeat(width)}] idle`;
  }
  const filled = Math.round((d / t) * width);
  const pct = Math.round((d / t) * 100);
  return `[${"█".repeat(filled)}${"░".repeat(Math.max(0, width - filled))}] ${d}/${t} ${pct}%`;
}

function pendingCountForCourse(courseId) {
  const cid = String(courseId || "");
  let count = fifo.filter((job) => job.courseId === cid).length;
  if (activeJob && activeJob.courseId === cid) count += 1;
  return count;
}

function markCourseEnqueued(courseId) {
  const cid = String(courseId || "");
  const pendingBefore = pendingCountForCourse(cid);
  const batch = courseBatches.get(cid) || { total: 0, completed: 0 };
  if (pendingBefore === 0) {
    courseBatches.set(cid, { total: 1, completed: 0 });
    return;
  }
  courseBatches.set(cid, {
    total: batch.total + 1,
    completed: batch.completed,
  });
}

function markCourseCompleted(courseId) {
  const cid = String(courseId || "");
  const batch = courseBatches.get(cid);
  if (!batch) return;
  courseBatches.set(cid, {
    total: batch.total,
    completed: Math.min(batch.total, batch.completed + 1),
  });
}

function logQueueProgress(event) {
  const waiting = fifo.length;
  const activeId = activeJob?.subsectionId || "idle";
  const courseId = activeJob?.courseId || "";
  const batch = courseId ? courseBatches.get(courseId) : null;
  const bar = batch
    ? asciiBar(batch.completed, batch.total)
    : asciiBar(0, waiting + (activeJob ? 1 : 0) || 0);
  console.log(
    `[lesson-queue] ${bar} ${event || "tick"} active=${activeId} waiting=${waiting}${
      courseId ? ` course=${courseId}` : ""
    }`
  );
  for (const [cid, stats] of courseBatches.entries()) {
    const pending = pendingCountForCourse(cid);
    if (pending === 0 && stats.completed >= stats.total && stats.total > 0) {
      console.log(
        `[lesson-queue] ${asciiBar(stats.completed, stats.total)} course=${cid} complete — enrollment can open`
      );
    } else if (pending > 0) {
      console.log(
        `[lesson-queue] ${asciiBar(stats.completed, stats.total)} course=${cid} pending=${pending}`
      );
    }
  }
}

function getCourseQueueSnapshot(courseId) {
  const cid = String(courseId || "");
  const batch = courseBatches.get(cid) || { total: 0, completed: 0 };
  const queued = fifo
    .filter((job) => job.courseId === cid)
    .map((job, index) => ({
      subsectionId: job.subsectionId,
      status: "queued",
      position: index + 1,
    }));
  const active =
    activeJob && activeJob.courseId === cid
      ? {
          subsectionId: activeJob.subsectionId,
          status: "processing",
          position: 0,
        }
      : null;
  const pendingCount = queued.length + (active ? 1 : 0);
  const completedCount = Number(batch.completed) || 0;
  const totalCount = Math.max(
    Number(batch.total) || 0,
    completedCount + pendingCount
  );
  const percent =
    totalCount <= 0
      ? 100
      : Math.round((Math.min(completedCount, totalCount) / totalCount) * 100);
  return {
    courseId: cid,
    activeSubsectionId: active?.subsectionId || null,
    queuedCount: queued.length,
    pendingCount,
    completedCount,
    totalCount,
    percent: pendingCount === 0 && totalCount > 0 ? 100 : percent,
    items: [...(active ? [active] : []), ...queued],
    idle: pendingCount === 0,
  };
}

function hasUsableKnowledge(dedupeResult, transcriptText) {
  const uniqueLen = [dedupeResult?.ppt, dedupeResult?.pdf, dedupeResult?.transcript]
    .map((text) => String(text || "").trim())
    .join("\n").length;
  const transcriptLen = filterWhisperNoise(transcriptText).length;
  return uniqueLen > 0 || transcriptLen > 0;
}

async function transcribeVideo(doc, assets, transcribe) {
  const existing = doc.transcriptText || "";
  if (!transcribe && existing) {
    return { text: existing, chunks: [] };
  }
  if (assets?.videoBuffer?.length) {
    return runWhisperTranscription(
      assets.videoBuffer,
      assets.videoName || "lesson.mp4"
    );
  }
  if (!doc.videoUrl) {
    return { text: existing, chunks: [] };
  }
  return runWhisperFromUrl(
    doc.videoUrl,
    assets?.videoName || fileNameFromUrl(doc.videoUrl, "lesson.mp4")
  );
}

async function loadOfficeBuffers(doc, assets) {
  let pptBuffer = assets?.pptBuffer || null;
  let pdfBuffer = assets?.pdfBuffer || null;

  if (!pptBuffer?.length && doc.pptUrl) {
    try {
      pptBuffer = await fetchRemoteBuffer(doc.pptUrl);
    } catch (error) {
      console.warn("[lesson-process] PPT download failed:", error.message);
    }
  }
  if (!pdfBuffer?.length && doc.pdfUrl) {
    try {
      pdfBuffer = await fetchRemoteBuffer(doc.pdfUrl);
    } catch (error) {
      console.warn("[lesson-process] PDF download failed:", error.message);
    }
  }

  return {
    pptBuffer,
    pdfBuffer,
    pptName:
      assets?.pptName ||
      doc.pptFileName ||
      fileNameFromUrl(doc.pptUrl, "lesson.pptx"),
  };
}

async function saveTranscriptChunks(doc, chunks) {
  await SubsectionTranscriptChunk.deleteMany({ subsectionId: doc._id });
  if (!Array.isArray(chunks) || !chunks.length) return;
  const chunkDocs = chunks.map((chunk, idx) => ({
    courseId: doc.courseId,
    sectionId: doc.sectionId,
    subsectionId: doc._id,
    index: Number.isFinite(chunk.index) ? chunk.index : idx,
    startSec: Number(chunk.startSec ?? idx * 10),
    endSec: Number(chunk.endSec ?? (idx + 1) * 10),
    text: chunk.text || "",
  }));
  await SubsectionTranscriptChunk.insertMany(chunkDocs);
}

async function processSubsection(subsectionId, options = {}) {
  const transcribe = options.transcribe !== false;
  const extractImages = options.extractImages !== false;
  const assets = options.assets || null;
  const doc = await CourseSubSection.findById(subsectionId);
  if (!doc) return;

  doc.knowledgeStatus = "processing";
  doc.knowledgeStatusReason = "";
  await doc.save();

  try {
    if (
      (!Number(doc.videoDurationSec) || Number(doc.videoDurationSec) <= 0) &&
      assets?.videoBuffer?.length
    ) {
      const durationSec = await readVideoDurationSec({
        buffer: assets.videoBuffer,
        mimetype: "video/mp4",
        size: assets.videoBuffer.length,
      });
      if (durationSec > 0) {
        doc.videoDurationSec = durationSec;
      }
    }

    let transcriptText = doc.transcriptText || "";
    let chunks = [];
    try {
      const transcription = await transcribeVideo(doc, assets, transcribe);
      transcriptText = transcription.text || transcriptText;
      chunks = Array.isArray(transcription.chunks) ? transcription.chunks : [];
      if (chunks.length) {
        doc.transcriptChunkCount = chunks.length;
      }
    } catch (error) {
      console.error("[lesson-process] Whisper failed:", error.message);
      if (!transcriptText) transcriptText = "";
    }

    const { pptBuffer, pdfBuffer, pptName } = await loadOfficeBuffers(doc, assets);
    const extracted = await extractLessonDocuments({
      pptBuffer,
      pptName,
      pdfBuffer,
      containsMath: Boolean(doc.containsMath),
    });
    const pptExtract = extracted.pptText || "";
    const pdfExtract = extracted.pdfText || "";
    const equations = extracted.equations || [];

    if (extractImages && (pptBuffer?.length || pdfBuffer?.length)) {
      const rollbackIds = [];
      const storedImages = await extractAndStoreDocumentImages({
        pptBuffer,
        pdfBuffer,
        rollbackIds,
      });
      if (pptBuffer?.length) {
        doc.extractedImages = replaceExtractedBySource(
          doc.extractedImages,
          "ppt",
          storedImages.filter((img) => img.source === "ppt")
        );
      }
      if (pdfBuffer?.length) {
        doc.extractedImages = replaceExtractedBySource(
          doc.extractedImages,
          "pdf",
          storedImages.filter((img) => img.source === "pdf")
        );
      }
      doc.markModified("extractedImages");
    }

    const dedupeResult = await dedupeSubsectionExtracts({
      pptText: pptExtract,
      pdfText: pdfExtract,
      transcriptText,
      protectMath: Boolean(doc.containsMath),
    });
    const quality = evaluateKnowledgeQuality({
      hasPptFile: Boolean(doc.pptUrl),
      hasPdfFile: Boolean(doc.pdfUrl),
      pptExtractLen: pptExtract.length,
      pdfExtractLen: pdfExtract.length,
      transcriptText,
      dedupedPpt: dedupeResult.ppt,
      dedupedPdf: dedupeResult.pdf,
      dedupedTranscript: dedupeResult.transcript,
      containsMath: Boolean(doc.containsMath),
      equations,
    });
    const usable = hasUsableKnowledge(dedupeResult, transcriptText);
    applyUniqueKnowledge(doc, {
      transcriptText,
      dedupeResult,
      equations,
      containsMath: Boolean(doc.containsMath),
      quality: {
        status: usable ? "ready" : "failed",
        reasons: usable ? [] : quality.reasons.length ? quality.reasons : ["empty_knowledge"],
      },
    });
    await doc.save();
    if (transcribe || chunks.length) {
      await saveTranscriptChunks(doc, chunks);
    }

    console.log(
      "[lesson-process]",
      String(doc._id),
      doc.knowledgeStatus,
      `transcript=${String(doc.transcriptText || "").length}`,
      `ppt=${pptExtract.length}`,
      `pdf=${pdfExtract.length}`,
      `unique=${String(doc.dedupedPptText || "").length + String(doc.dedupedPdfText || "").length + String(doc.dedupedTranscriptText || "").length}`,
      quality.ok ? "ok" : quality.reasons.join(",")
    );
    await notifyLessonProcessed(doc, doc.knowledgeStatus);
  } catch (error) {
    console.error("[lesson-process]", String(subsectionId), error.message);
    doc.knowledgeStatus = "failed";
    doc.knowledgeStatusReason = error.message || "Processing failed";
    await doc.save();
    await notifyLessonProcessed(doc, "failed").catch(() => {});
  }
}

function buildJob(subsectionId, options = {}, attachAssets) {
  return {
    subsectionId: String(subsectionId),
    courseId: String(options.courseId || ""),
    transcribe: options.transcribe,
    extractImages: options.extractImages,
    assets: attachAssets ? options.assets || null : null,
  };
}

function enqueueJob(subsectionId, options = {}) {
  const id = String(subsectionId || "");
  if (!id) return;

  const courseId = String(options.courseId || "");
  const withoutBuffers = { ...options, assets: null };

  if (activeJob && activeJob.subsectionId === id) {
    pendingRequeue.set(id, withoutBuffers);
    logQueueProgress("requeue-after-active");
    return;
  }

  const waitingIdx = fifo.findIndex((job) => job.subsectionId === id);
  if (waitingIdx >= 0) {
    fifo[waitingIdx] = {
      ...fifo[waitingIdx],
      transcribe: options.transcribe,
      extractImages: options.extractImages,
      assets: null,
    };
    logQueueProgress("replace-queued");
    return;
  }

  const attachAssets = !activeJob && fifo.length === 0;
  markCourseEnqueued(courseId);
  fifo.push(buildJob(id, options, attachAssets));
  logQueueProgress("enqueue");
  pump();
}

async function pump() {
  if (draining) return;
  draining = true;
  try {
    while (fifo.length) {
      const job = fifo.shift();
      activeJob = job;
      logQueueProgress("start");
      try {
        await processSubsection(job.subsectionId, {
          transcribe: job.transcribe,
          extractImages: job.extractImages,
          assets: job.assets || null,
        });
      } catch (error) {
        console.error("[lesson-queue]", job.subsectionId, error.message);
      } finally {
        job.assets = null;
        markCourseCompleted(job.courseId);
        activeJob = null;
        const again = pendingRequeue.get(job.subsectionId);
        if (again) {
          pendingRequeue.delete(job.subsectionId);
          enqueueJob(job.subsectionId, again);
        }
        logQueueProgress("done");
      }
    }
  } finally {
    draining = false;
    if (fifo.length) {
      setImmediate(pump);
    } else {
      logQueueProgress("idle");
    }
  }
}

function scheduleProcessSubsection(subsectionId, options = {}) {
  enqueueJob(subsectionId, options);
}

async function recoverInterruptedLessonJobs() {
  const stuck = await CourseSubSection.find({
    knowledgeStatus: { $in: ["queued", "processing"] },
  })
    .select("_id courseId")
    .lean();
  if (!stuck.length) return;
  console.log(
    `[lesson-queue] recovering ${stuck.length} interrupted subsection job(s)`
  );
  for (const doc of stuck) {
    await CourseSubSection.updateOne(
      { _id: doc._id },
      { $set: { knowledgeStatus: "queued", knowledgeStatusReason: "" } }
    );
    scheduleProcessSubsection(doc._id, {
      courseId: String(doc.courseId || ""),
      transcribe: true,
      extractImages: true,
    });
  }
}

module.exports = {
  scheduleProcessSubsection,
  processSubsection,
  getCourseQueueSnapshot,
  recoverInterruptedLessonJobs,
};
