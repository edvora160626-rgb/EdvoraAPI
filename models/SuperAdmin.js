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

module.exports = mongoose.model("SuperAdmin", superAdminSchema);
