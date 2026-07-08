const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
    {
        schoolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "School",
            required: true,
            index: true,
        },
        classId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class",
            required: true,
        },

        subjectName: {
            type: String,
            required: true,
            trim: true,
        },

        subjectCode: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
        },

        description: {
            type: String,
            trim: true,
            default: "",
        },

        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE"],
            default: "ACTIVE",
            index: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            required: true,
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Teacher",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Prevent duplicate subject names within a school
subjectSchema.index(
    {
        schoolId: 1,
        classId:1,
        subjectName: 1,
    },
    {
        unique: true,
    }
);

// Prevent duplicate subject codes within a school
subjectSchema.index(
    {
        schoolId: 1,
        classId:1,
        subjectCode: 1,
    },
    {
        unique: true,
    }
);

module.exports = mongoose.model("Subject", subjectSchema);