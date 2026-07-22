const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    departmentName: {
      type: String,
      required: true,
      trim: true,
    },

    departmentCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    departmentHead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    phoneCode: {
      type: String,
      trim: true,
      default: "91",
      set: (value) => String(value ?? "").replace(/\D/g, "") || "91",
    },

    roomNumber: {
      type: String,
      trim: true,
      default: "",
    },

    branch: {
      type: String,
      trim: true,
      default: "",
    },

    parentDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },

    color: {
      type: String,
      default: "#4F46E5",
    },

    displayOrder: {
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
      ref: "SchoolAdmin",
      required: true,
    },
    teacherids:[{
      type: mongoose.Schema.Types.ObjectId,
      ref:"Teacher"
    }]
  },
  {
    timestamps: true, // Automatically creates createdAt & updatedAt
  }
);

// Prevent duplicate department codes within the same school
departmentSchema.index(
  { schoolId: 1, departmentCode: 1 },
  { unique: true }
);

// Prevent duplicate department names within the same school
departmentSchema.index(
  { schoolId: 1, departmentName: 1 },
  { unique: true }
);

module.exports = mongoose.model("Department", departmentSchema);