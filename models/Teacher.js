const mongoose = require("mongoose");
const baseUserFields = require("./baseUserSchema");

const teacherSchema = new mongoose.Schema(
    {
        ...baseUserFields,
        role: {
            type: String,
            default: "TEACHER",
            immutable: true,
        },

        // Teacher-specific fields
        staffId: {
            type: String,
        },

        employeeId: {
            type: String,
        },

        department: {
            type: String,
        },

        qualification: {
            type: String,
        },

        experience: {
            type: Number,
        },

        subjects: {
            type: [String],
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Teacher", teacherSchema);
