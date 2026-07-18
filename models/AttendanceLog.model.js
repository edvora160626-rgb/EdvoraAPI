const mongoose = require("mongoose");

const attendanceLogSchema = new mongoose.Schema(
    {
        schoolId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "School",
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ["TEACHER", "STUDENT"],
            required: true,
            index: true,
        },
        action: {
            type: String,
            enum: ["MARKED", "UPDATED", "BULK_UPLOAD"],
            required: true,
        },
        attendanceDate: {
            type: Date,
            required: true,
            index: true,
        },
        classId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class",
            default: null,
        },
        classLabel: {
            type: String,
            default: "",
            trim: true,
        },
        attendanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Attendance",
            default: null,
        },
        markedBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        markedByName: {
            type: String,
            default: "Unknown",
            trim: true,
        },
        markedByRole: {
            type: String,
            default: "",
            trim: true,
        },
        recordCount: {
            type: Number,
            default: 0,
        },
        summary: {
            total: { type: Number, default: 0 },
            PRESENT: { type: Number, default: 0 },
            ABSENT: { type: Number, default: 0 },
            LATE: { type: Number, default: 0 },
            HALF_DAY: { type: Number, default: 0 },
            LEAVE: { type: Number, default: 0 },
        },
        notes: {
            type: String,
            default: "",
            trim: true,
        },
        source: {
            type: String,
            enum: ["MANUAL", "BULK"],
            default: "MANUAL",
        },
    },
    {
        timestamps: true,
    }
);

attendanceLogSchema.index({ schoolId: 1, type: 1, createdAt: -1 });
attendanceLogSchema.index({ schoolId: 1, type: 1, classId: 1, createdAt: -1 });

module.exports = mongoose.model("AttendanceLog", attendanceLogSchema);
