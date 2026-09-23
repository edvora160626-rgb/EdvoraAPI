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

productAdminSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model("ProductAdmin", productAdminSchema);
