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

studentSchema.index({ schoolId: 1, status: 1 });
studentSchema.index({ schoolId: 1, grade: 1, status: 1 });
studentSchema.index({ schoolId: 1, admissionNumber: 1 });

module.exports = mongoose.model("Student", studentSchema);
