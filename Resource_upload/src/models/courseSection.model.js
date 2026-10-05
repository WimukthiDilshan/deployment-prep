const mongoose = require("mongoose");

const courseSectionSchema = new mongoose.Schema(
  {
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
    sectionName: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

courseSectionSchema.virtual("subsections", {
  ref: "CourseSubSection",
  localField: "_id",
  foreignField: "sectionId",
});

module.exports = mongoose.model(
  "CourseSection",
  courseSectionSchema,
  "course_section"
);
