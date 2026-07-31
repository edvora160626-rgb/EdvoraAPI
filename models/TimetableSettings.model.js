const mongoose = require("mongoose");

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const timetableSettingsSchema = new mongoose.Schema(
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
    workingDays: {
      type: [
        {
          type: String,
          enum: DAYS,
        },
      ],
      default: ["MON", "TUE", "WED", "THU", "FRI"],
    },
    schoolStart: {
      type: String,
      default: "08:00",
      trim: true,
    },
    schoolEnd: {
      type: String,
      default: "15:00",
      trim: true,
    },
    defaultPeriodMinutes: {
      type: Number,
      default: 45,
      min: 15,
      max: 180,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

timetableSettingsSchema.index(
  { schoolId: 1, academicYearId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "TimetableSettings",
  timetableSettingsSchema,
  "timetable_settings"
);
module.exports.DAYS = DAYS;
