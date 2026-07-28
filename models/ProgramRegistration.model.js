const mongoose = require("mongoose");

const programRegistrationSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },

    programId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventProgram",
      required: true,
      index: true,
    },

    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    registeredAt: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      enum: ["REGISTERED", "CANCELLED"],
      default: "REGISTERED",
      index: true,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

programRegistrationSchema.index(
  { programId: 1, studentId: 1 },
  { unique: true }
);
programRegistrationSchema.index({ schoolId: 1, eventId: 1, status: 1 });
programRegistrationSchema.index({ schoolId: 1, studentId: 1, status: 1 });

module.exports = mongoose.model(
  "ProgramRegistration",
  programRegistrationSchema,
  "programregistrations"
);
