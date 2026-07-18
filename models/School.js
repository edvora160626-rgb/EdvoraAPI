const mongoose = require("mongoose");

const schoolSchema = new mongoose.Schema(
    {
        schoolName: {
            type: String,
            required: true,
        },
        schoolCode: {
            type: String,
            required: true,
            unique: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
        },
        phone: {
            type: String,
            required: true,
        },
        address: {
            type: String,
            required: true,

        },
        logo: {
            type: String,
        },
        city: {
            type: String,
            required: true,


        },
        state: {
            type: String,
            required: true,


        },
        country: {
            type: String,
            required: true,


        },
        pincode: {
            type: String,
            required: true,


        },
        website: {
            type: String,
            required: true,


        },
        principalName: {
            type: String,
            required: true,


        },
        status: {
            type: String,
            enum: ["ACTIVE", "INACTIVE"],
            default: "ACTIVE",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("School", schoolSchema);