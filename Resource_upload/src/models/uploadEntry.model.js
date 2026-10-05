const mongoose = require("mongoose");

const uploadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    videoUrl: {
      type: String,
      required: false,
    },
    videoPublicId: {
      type: String,
      required: false,
    },
    transcriptPreview: {
      type: String,
      required: false,
      trim: true,
    },
    transcriptChunkCount: {
      type: Number,
      required: false,
      default: 0,
    },
  },
  { timestamps: true }
);

const UploadEntry = mongoose.model("UploadEntry", uploadSchema);

module.exports = UploadEntry;
