const mongoose = require("mongoose");

const ATTENDANCE_STATUSES = [
    "PRESENT",
    "ABSENT",
    "LATE",
    "HALF_DAY",
    "LEAVE",
];

const attendanceRecordSchema = new mongoose.Schema(
    {
        personId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        status: {
            type: String,
            enum: ATTENDANCE_STATUSES,
            default: "PRESENT",
            required: true,
        },
        remarks: {
            type: String,
            trim: true,
            default: "",
        },
    },
    { _id: false }
);

const attendanceSchema = new mongoose.Schema(
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
        date: {
            type: Date,
            required: true,
            index: true,
        },
        classId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Class",
            default: null,
        },
        records: {
            type: [attendanceRecordSchema],
            default: [],
        },
        markedBy: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        notes: {
            type: String,
            trim: true,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

attendanceSchema.index(
    { schoolId: 1, type: 1, date: 1, classId: 1 },
    { unique: true }
);

module.exports = mongoose.model("Attendance", attendanceSchema);
module.exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES;
