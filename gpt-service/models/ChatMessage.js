const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    question: { type: String, required: true, trim: true },
    answer: { type: String, required: true, trim: true },
    model: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
