const mongoose = require("mongoose");
const baseUserFields = require("./baseUserSchema");

const studentSchema = new mongoose.Schema(
    {
        ...baseUserFields,
        role: {
            type: String,
            default: "STUDENT",
            immutable: true,
        },

        // Student-specific fields
        admissionNumber: {
            type: String,
        },

        rollNumber: {
            type: String,
        },

        grade: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class"
        },

        section: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Student", studentSchema);
