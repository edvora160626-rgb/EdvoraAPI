const mongoose = require("mongoose");

const examQuestionSchema = new mongoose.Schema(
  {
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamSubject",
      required: true,
      index: true,
    },
    topic: { type: String, trim: true, default: "General", index: true },
    /** Nextestify-style type codes: SCI | MCU | TRU */
    questionType: {
      type: String,
      enum: ["SCI", "MCU", "TRU"],
      default: "SCI",
      index: true,
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Medium",
      index: true,
    },
    text: { type: String, required: true, trim: true },
    options: {
      type: [String],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 2,
        message: "At least 2 options required",
      },
    },
    /** Primary correct option (SCI / TRU / MCU first) */
    correctIndex: { type: Number, required: true, min: 0 },
    /** MCU — all correct option indexes */
    correctIndexes: {
      type: [Number],
      default: undefined,
    },
    explanation: { type: String, default: "" },
    remarks: { type: String, default: "" },
    marks: { type: Number, default: 1, min: 0 },
    timeMin: { type: Number, default: 2, min: 0 },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamCandidate",
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExamQuestion", examQuestionSchema);
