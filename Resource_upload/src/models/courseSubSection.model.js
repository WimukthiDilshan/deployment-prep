const mongoose = require("mongoose");

const imageEntrySchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
);

const extractedImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    source: { type: String, enum: ["ppt", "pdf"], required: true },
    filePath: { type: String, default: "" },
    pageNumber: { type: Number, default: 0 },
  },
  { _id: true }
);

const courseSubSectionSchema = new mongoose.Schema(
  {
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CourseSection",
      required: true,
      index: true,
    },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    educatorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    order: { type: Number, default: 0 },
    videoUrl: { type: String, default: "" },
    videoPublicId: { type: String, default: "" },
    videoDurationSec: { type: Number, default: 0 },
    pptUrl: { type: String, default: "" },
    pptPublicId: { type: String, default: "" },
    pptFileName: { type: String, default: "" },
    pdfUrl: { type: String, default: "" },
    pdfPublicId: { type: String, default: "" },
    pdfFileName: { type: String, default: "" },
    images: { type: [imageEntrySchema], default: [] },
    extractedImages: { type: [extractedImageSchema], default: [] },
    containsMath: { type: Boolean, default: false },
    equations: {
      type: [
        {
          latex: { type: String, required: true },
          source: { type: String, default: "ppt" },
        },
      ],
      default: [],
      _id: false,
    },
    pptText: { type: String, default: "" },
    pdfText: { type: String, default: "" },
    transcriptText: { type: String, default: "" },
    transcriptPreview: { type: String, default: "" },
    transcriptChunkCount: { type: Number, default: 0 },
    dedupedPptText: { type: String, default: "" },
    dedupedPdfText: { type: String, default: "" },
    dedupedTranscriptText: { type: String, default: "" },
    dedupeStats: { type: Object, default: null },
    knowledgeStatus: {
      type: String,
      enum: ["queued", "processing", "ready", "needs_rebuild", "rebuilding", "failed"],
      default: "ready",
    },
    knowledgeStatusReason: { type: String, default: "" },
  },
  { timestamps: true }
);

courseSubSectionSchema.index({ sectionId: 1, order: 1 });

module.exports = mongoose.model(
  "CourseSubSection",
  courseSubSectionSchema,
  "course_subsection"
);
