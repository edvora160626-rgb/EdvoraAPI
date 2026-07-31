const mongoose = require("mongoose");

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

const teacherAvailabilitySchema = new mongoose.Schema(
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
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
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
    maxPeriodsPerDay: {
      type: Number,
      default: 6,
      min: 1,
      max: 12,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  { timestamps: true }
);

teacherAvailabilitySchema.index(
  { schoolId: 1, academicYearId: 1, teacherId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "TeacherAvailability",
  teacherAvailabilitySchema,
  "teacher_availability"
);
