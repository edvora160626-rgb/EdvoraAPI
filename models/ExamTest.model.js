const mongoose = require("mongoose");

const examTestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamSubject",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["PRACTICE", "SCHEDULED", "ON_DEMAND"],
      required: true,
      index: true,
    },
    difficulty: {
      type: String,
      enum: ["Easy", "Medium", "Hard"],
      default: "Medium",
    },
    durationMin: { type: Number, required: true, min: 1 },
    passPercent: { type: Number, default: 40, min: 0, max: 100 },
    questionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ExamQuestion",
      },
    ],
    startsAt: { type: Date },
    endsAt: { type: Date },
    maxAttempts: { type: Number, default: 0 }, // 0 = unlimited
    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "ARCHIVED"],
      default: "PUBLISHED",
      index: true,
    },
  },
  { timestamps: true }
);

examTestSchema.virtual("questionCount").get(function () {
  return Array.isArray(this.questionIds) ? this.questionIds.length : 0;
});

examTestSchema.set("toJSON", { virtuals: true });
examTestSchema.set("toObject", { virtuals: true });
examTestSchema.index({ status: 1, type: 1, startsAt: 1 });

module.exports = mongoose.model("ExamTest", examTestSchema);
