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

teacherSchema.index({ schoolId: 1, status: 1 });
teacherSchema.index({ schoolId: 1, employeeId: 1 });
teacherSchema.index({ schoolId: 1, email: 1 });

module.exports = mongoose.model("Teacher", teacherSchema);
