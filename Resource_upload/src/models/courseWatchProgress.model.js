const mongoose = require("mongoose");

const lessonWatchSchema = new mongoose.Schema(
  {
    subsectionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    durationSec: { type: Number, default: 0 },
    intervals: { type: Array, default: [] },
  },
  { _id: false }
);

const courseWatchProgressSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },
    lessons: { type: [lessonWatchSchema], default: [] },
  },
  { timestamps: true }
);

courseWatchProgressSchema.index({ userId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model(
  "CourseWatchProgress",
  courseWatchProgressSchema,
  "course_watch_progress"
);
