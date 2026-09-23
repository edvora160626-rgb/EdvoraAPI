const mongoose = require("mongoose");
const baseUserFields = require("./baseUserSchema");

const parentSchema = new mongoose.Schema(
    {
        ...baseUserFields,
        role: {
            type: String,
            default: "PARENT",
            immutable: true,
        },

        // Parent-specific fields
        relationship: {
            type: String,
            enum: ["Father", "Mother", "Guardian"],
        },

        children: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Student",
            },
        ],
    },
    {
        timestamps: true,
    }
);

parentSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model("Parent", parentSchema);
