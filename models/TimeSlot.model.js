const mongoose = require("mongoose");

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const timeSlotSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      min: 0,
    },
    startTime: {
      type: String,
      required: true,
      trim: true,
    },
    endTime: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["PERIOD", "BREAK", "LUNCH"],
      default: "PERIOD",
    },
    /** Empty / missing = applies to every working day (legacy slots). */
    days: {
      type: [
        {
          type: String,
          enum: DAYS,
        },
      ],
      default: [],
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

timeSlotSchema.index({ schoolId: 1, academicYearId: 1, order: 1 });

module.exports = mongoose.model("TimeSlot", timeSlotSchema, "time_slots");
