const mongoose = require('mongoose');

const enrollmentSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    courseId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    courseName: {
      type: String,
      default: '',
      trim: true,
    },
    educatorName: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { timestamps: true }
);

enrollmentSchema.index({ studentId: 1, courseId: 1 }, { unique: true });

module.exports = mongoose.model('Enrollment', enrollmentSchema);
