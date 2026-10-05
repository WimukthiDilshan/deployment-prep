const mongoose = require("mongoose");

const subsectionTranscriptChunkSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseSection",
      required: true,
      index: true,
    },
    subsectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseSubSection",
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

subsectionTranscriptChunkSchema.index({ subsectionId: 1, index: 1 }, { unique: true });
subsectionTranscriptChunkSchema.index({ courseId: 1, sectionId: 1, subsectionId: 1 });

module.exports = mongoose.model(
  "SubsectionTranscriptChunk",
  subsectionTranscriptChunkSchema
);
