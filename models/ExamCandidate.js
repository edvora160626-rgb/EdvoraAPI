const mongoose = require("mongoose");

/**
 * Examination portal users:
 * EXAM_ADMIN | EXAM_CANDIDATE
 * EXAM_PROCTOR is kept in the enum only for legacy documents.
 * Separate from school role collections.
 */
const EXAM_USER_ROLES = ["EXAM_ADMIN", "EXAM_CANDIDATE", "EXAM_PROCTOR"];

const examCandidateSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      unique: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    phoneCode: {
      type: String,
      required: true,
      default: "91",
      set: (value) => String(value ?? "").replace(/\D/g, "") || "91",
    },
    password: {
      type: String,
      required: true,
    },
    profileImage: {
      type: String,
      default: "",
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", ""],
      default: "",
    },
    role: {
      type: String,
      enum: EXAM_USER_ROLES,
      default: "EXAM_CANDIDATE",
      required: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },
    forgotOtp: {
      type: String,
    },
    mustChangePassword: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

examCandidateSchema.index({ phone: 1, phoneCode: 1 });
examCandidateSchema.index({ role: 1, status: 1 });

module.exports = mongoose.model("ExamCandidate", examCandidateSchema);
module.exports.EXAM_USER_ROLES = EXAM_USER_ROLES;
