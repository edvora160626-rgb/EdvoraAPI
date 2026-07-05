const mongoose = require("mongoose");

/**
 * Returns a base schema definition object containing fields common to all user roles.
 * Each role-specific model spreads this into its own schema.
 */
const baseUserFields = {
    schoolId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "School",
        required: true,
    },

    firstName: {
        type: String,
        required: true,
        trim: true,
    },

    lastName: {
        type: String,
        trim: true,
    },

    email: {
        type: String,
        required: true,
        lowercase: true,
        unique: true,
    },

    phone: {
        type: String,
        required: true,
        unique: true,
    },

    phoneCode: {
        type: String,
        required: true,
    },

    password: {
        type: String,
    },

    profileImage: {
        type: String,
        default: "",
    },

    gender: {
        type: String,
        enum: ["Male", "Female", "Other"],
    },

    dob: {
        type: Date,
    },

    address: {
        type: String,
    },

    status: {
        type: String,
        enum: ["ACTIVE", "INACTIVE", "REQUESTED"],
        default: "REQUESTED",
    },

    welcomeOTP: {
        type: String,
    },

    mustChangePassword: {
        type: Number,
        required: true,
        default: 0,
    },

    forgotOtp: {
        type: String,
    },
};

module.exports = baseUserFields;
