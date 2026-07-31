const mongoose = require("mongoose");

const roomSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    type: {
      type: String,
      enum: ["CLASSROOM", "LAB", "LIBRARY", "AUDITORIUM", "OTHER"],
      default: "CLASSROOM",
    },
    capacity: {
      type: Number,
      default: 40,
      min: 1,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

roomSchema.index({ schoolId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Room", roomSchema, "rooms");
