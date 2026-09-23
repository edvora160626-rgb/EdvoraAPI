const mongoose = require("mongoose");
const baseUserFields = require("./baseUserSchema");

const superAdminSchema = new mongoose.Schema(
    {
        ...baseUserFields,
        role: {
            type: String,
            default: "SUPER_ADMIN",
            immutable: true,
        },
    },
    {
        timestamps: true,
    }
);

superAdminSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model("SuperAdmin", superAdminSchema);
