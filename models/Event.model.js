const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
      index: true,
    },

    eventName: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    bannerUrl: {
      type: String,
      trim: true,
      default: "",
    },

    eventDate: {
      type: Date,
      required: true,
    },

    eventTime: {
      type: String,
      trim: true,
      default: "",
    },

    venue: {
      type: String,
      trim: true,
      default: "",
    },

    registrationStartDate: {
      type: Date,
      required: true,
    },

    registrationEndDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["DRAFT", "PUBLISHED", "CANCELLED"],
      default: "DRAFT",
      index: true,
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

eventSchema.index({ schoolId: 1, status: 1, eventDate: 1 });
eventSchema.index({ schoolId: 1, eventName: 1 });

module.exports = mongoose.model("Event", eventSchema, "events");
