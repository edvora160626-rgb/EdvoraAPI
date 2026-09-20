const mongoose = require("mongoose");

const examStudyMaterialSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamSubject",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["PDF", "Video", "Document", "Link"],
      default: "Document",
    },
    content: { type: String, default: "" },
    url: { type: String, default: "" },
    pages: { type: Number, default: 0 },
    durationMin: { type: Number, default: 0 },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExamStudyMaterial", examStudyMaterialSchema);
