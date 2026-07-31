const mongoose = require("mongoose");

const holidaySchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },
    academicYearId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicYear",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["HOLIDAY", "SPECIAL_WORKING"],
      default: "HOLIDAY",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

holidaySchema.index({ schoolId: 1, academicYearId: 1, date: 1 });

module.exports = mongoose.model("Holiday", holidaySchema, "holidays");
