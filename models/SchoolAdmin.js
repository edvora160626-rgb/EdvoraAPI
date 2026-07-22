const mongoose = require("mongoose");
const baseUserFields = require("./baseUserSchema");

const schoolAdminSchema = new mongoose.Schema(
    {
        ...baseUserFields,
        role: {
            type: String,
            default: "SCHOOL_ADMIN",
            immutable: true,
        },
        employeeId: {
            type: String,
        },
    },
    {
        timestamps: true,
    }
);

schoolAdminSchema.index({ schoolId: 1, employeeId: 1 });

module.exports = mongoose.model("SchoolAdmin", schoolAdminSchema);
