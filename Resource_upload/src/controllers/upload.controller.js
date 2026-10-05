const cloudinary = require("../config/cloudinary");
const mongoose = require("mongoose");
const UploadEntry = require("../models/uploadEntry.model");
const TranscriptChunk = require("../models/transcriptChunk.model");
const {
  runWhisperTranscription,
} = require("../services/transcription.service");
const { assertVideoDurationLimit } = require("../utils/videoDuration");

const healthCheck = (req, res) => {
  res.json({
    message: "Resource_upload server is running",
    database: "upload_section",
  });
};

const createNameEntry = async (req, res) => {
  try {
    const { name } = req.body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required and must be a string",
      });
    }

    const savedEntry = await UploadEntry.create({ name: name.trim() });

    return res.status(201).json({
      success: true,
      message: "Name saved successfully",
      data: {
        id: savedEntry._id,
        name: savedEntry.name,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to save name",
    });
  }
};

const createNameWithVideo = async (req, res) => {
  try {
    const { name } = req.body || {};

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Name is required and must be a string",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Video file is required",
      });
    }

    try {
      await assertVideoDurationLimit(req.file);
    } catch (durationErr) {
      return res.status(400).json({
        success: false,
        message: durationErr.message || "Video must be 15 minutes or less.",
      });
    }

    const transcriptionResult = await runWhisperTranscription(
      req.file.buffer,
      req.file.originalname
    );

    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "upload_section_videos",
          resource_type: "video",
        },
        (error, result) => {
          if (error) return reject(error);
          return resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    const savedEntry = await UploadEntry.create({
      name: name.trim(),
      videoUrl: uploadResult.secure_url,
      videoPublicId: uploadResult.public_id,
      transcriptPreview: (transcriptionResult.text || "").slice(0, 300),
      transcriptChunkCount: transcriptionResult.chunks.length,
    });

    if (transcriptionResult.chunks.length > 0) {
      const chunkDocs = transcriptionResult.chunks.map((chunk, idx) => ({
        uploadId: savedEntry._id,
        index: Number.isFinite(chunk.index) ? chunk.index : idx,
        startSec: Number(chunk.startSec ?? idx * 10),
        endSec: Number(chunk.endSec ?? (idx + 1) * 10),
        text: chunk.text || "",
      }));

      await TranscriptChunk.insertMany(chunkDocs);
    }

    return res.status(201).json({
      success: true,
      message: "Video uploaded and saved successfully",
      data: {
        id: savedEntry._id,
        name: savedEntry.name,
        videoUrl: savedEntry.videoUrl,
        transcriptPreview: savedEntry.transcriptPreview,
        transcriptChunkCount: savedEntry.transcriptChunkCount,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to upload video",
    });
  }
};

const getTranscriptChunksByUploadId = async (req, res) => {
  try {
    const { uploadId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(uploadId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid uploadId",
      });
    }
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit || "50", 10), 1),
      200
    );
    const skip = (page - 1) * limit;

    const [chunks, total] = await Promise.all([
      TranscriptChunk.find({ uploadId })
        .sort({ index: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TranscriptChunk.countDocuments({ uploadId }),
    ]);

    return res.json({
      success: true,
      data: {
        uploadId,
        page,
        limit,
        total,
        chunks,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch transcript chunks",
    });
  }
};

const getUploadsWithTranscripts = async (req, res) => {
  try {
    const uploads = await UploadEntry.find({})
      .sort({ createdAt: -1 })
      .lean();

    const uploadIds = uploads.map((item) => item._id);
    const chunks = await TranscriptChunk.find({ uploadId: { $in: uploadIds } })
      .sort({ uploadId: 1, index: 1 })
      .lean();

    const chunkMap = new Map();
    for (const chunk of chunks) {
      const key = String(chunk.uploadId);
      if (!chunkMap.has(key)) {
        chunkMap.set(key, []);
      }
      chunkMap.get(key).push(chunk);
    }

    const data = uploads.map((upload) => {
      const groupedChunks = chunkMap.get(String(upload._id)) || [];
      const transcriptText = groupedChunks.map((item) => item.text).join(" ").trim();

      return {
        id: upload._id,
        name: upload.name,
        videoUrl: upload.videoUrl,
        transcriptText,
        transcriptChunkCount: upload.transcriptChunkCount || groupedChunks.length,
        createdAt: upload.createdAt,
      };
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch uploads",
    });
  }
};

module.exports = {
  healthCheck,
  createNameEntry,
  createNameWithVideo,
  getTranscriptChunksByUploadId,
  getUploadsWithTranscripts,
};
