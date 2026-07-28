const mongoose = require("mongoose");

const eventProgramSchema = new mongoose.Schema(
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

    programName: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    programDate: {
      type: Date,
      required: true,
    },

    programTime: {
      type: String,
      trim: true,
      default: "",
    },

    venue: {
      type: String,
      trim: true,
      default: "",
    },

    maxParticipants: {
      type: Number,
      default: null,
      min: 1,
    },

    eligibleClasses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Class",
      },
    ],

    registrationDeadline: {
      type: Date,
      required: true,
    },

    registrationStatus: {
      type: String,
      enum: ["OPEN", "CLOSED"],
      default: "OPEN",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

eventProgramSchema.index({ schoolId: 1, eventId: 1, programName: 1 });

module.exports = mongoose.model("EventProgram", eventProgramSchema, "eventprograms");
