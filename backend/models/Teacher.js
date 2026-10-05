const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Teacher', teacherSchema);
