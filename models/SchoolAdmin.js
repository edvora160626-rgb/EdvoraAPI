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
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("SchoolAdmin", schoolAdminSchema);
