const mongoose = require("mongoose");

const examForumPostSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExamCandidate",
      required: true,
      index: true,
    },
    authorName: { type: String, required: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    tag: { type: String, default: "General", trim: true },
    replyCount: { type: Number, default: 0 },
    status: { type: String, enum: ["ACTIVE", "HIDDEN"], default: "ACTIVE" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ExamForumPost", examForumPostSchema);
