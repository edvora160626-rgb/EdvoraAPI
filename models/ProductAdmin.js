const mongoose = require("mongoose");
const baseUserFields = require("./baseUserSchema");

const productAdminSchema = new mongoose.Schema(
    {
        ...baseUserFields,
        role: {
            type: String,
            default: "PRODUCT_ADMIN",
            immutable: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("ProductAdmin", productAdminSchema);
