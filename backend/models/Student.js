const mongoose = require('mongoose');


const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  mobileNumber: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    default: 'Student',
    enum: ['Student'],
  },
  password: {
    type: String,
    required: true,
  },
  // --- New Optional Fields ---
  visualVerbalCognitiveStyle: {
    type: String,
    trim: true,
  },
  learnerProfile: {
    type: String,
    trim: true,
  },
  analyticWholisticCognitiveStyle: {
    type: String,
    trim: true,
  },

}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);