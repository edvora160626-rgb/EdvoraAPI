const mongoose = require("mongoose");

const examEnrollmentSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ["ENROLLED", "CANCELLED"],
      default: "ENROLLED",
    },
  },
  { timestamps: true }
);

examEnrollmentSchema.index({ candidateId: 1, testId: 1 }, { unique: true });

module.exports = mongoose.model("ExamEnrollment", examEnrollmentSchema);
