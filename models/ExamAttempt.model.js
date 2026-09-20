const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamQuestion",
      required: true,
    },
    selectedIndex: { type: Number, default: null },
  },
  { _id: false }
);

const examAttemptSchema = new mongoose.Schema(
  {
    candidateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamCandidate",
      required: true,
      index: true,
    },
    testId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamTest",
      required: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ["PRACTICE", "EXAM"],
      default: "EXAM",
    },
    status: {
      type: String,
      enum: ["IN_PROGRESS", "SUBMITTED", "EXPIRED"],
      default: "IN_PROGRESS",
      index: true,
    },
    questionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ExamQuestion",
      },
    ],
    answers: [answerSchema],
    startedAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    submittedAt: { type: Date },
    score: { type: Number, default: null },
    correctCount: { type: Number, default: 0 },
    totalQuestions: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    certificateIssued: { type: Boolean, default: false },
  },
  { timestamps: true }
);

examAttemptSchema.index({ candidateId: 1, testId: 1, status: 1 });

module.exports = mongoose.model("ExamAttempt", examAttemptSchema);
