const mongoose = require("mongoose");

const classSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    className: {
      type: String,
      required: true,
      trim: true,
      // Examples: "Grade 1", "Class 10", "LKG", "UKG"
    },

    section: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      // A, B, C...
    },

    // academicYear: {
    //   type: String,
    //   required: true,
    //   // Example: "2026-2027"
    // },

    classTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
    },


    strength: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["ACTIVE", "INACTIVE"],
      default: "ACTIVE",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher"
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate classes within the same school and academic year
classSchema.index({
  schoolId: 1,
  className: 1,
  section: 1,
}, {
  unique: true,
});

module.exports = mongoose.model("Class", classSchema);