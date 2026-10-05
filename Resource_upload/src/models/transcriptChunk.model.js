const mongoose = require("mongoose");

const transcriptChunkSchema = new mongoose.Schema(
  {
    uploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UploadEntry",
      required: true,
      index: true,
    },
    index: {
      type: Number,
      required: true,
    },
    startSec: {
      type: Number,
      required: true,
    },
    endSec: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

transcriptChunkSchema.index({ uploadId: 1, index: 1 }, { unique: true });

const TranscriptChunk = mongoose.model("TranscriptChunk", transcriptChunkSchema);

module.exports = TranscriptChunk;
