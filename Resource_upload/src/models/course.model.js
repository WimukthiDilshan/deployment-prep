const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    educatorId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    courseName: { type: String, required: true, trim: true },
    educatorName: { type: String, default: "", trim: true },
    thumbnailUrl: { type: String, required: true },
    keywords: [{ type: String, trim: true }],
    description: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Course", courseSchema, "course");
