const mongoose = require("mongoose");

const subjectAllocationSchema = new mongoose.Schema(
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
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Class",
      required: true,
      index: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      required: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      required: true,
    },
    periodsPerWeek: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
      default: 5,
    },
    preferredRoomType: {
      type: String,
      enum: ["CLASSROOM", "LAB", "LIBRARY", "AUDITORIUM", "OTHER", ""],
      default: "",
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

subjectAllocationSchema.index(
  { schoolId: 1, academicYearId: 1, classId: 1, subjectId: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "SubjectAllocation",
  subjectAllocationSchema,
  "subject_allocations"
);
