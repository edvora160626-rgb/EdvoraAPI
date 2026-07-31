const express = require("express");
const {
    getAssignedClassesForAttendance,
    getTeachersForAttendance,
    getStudentsForAttendance,
    markAttendance,
    bulkUploadAttendance,
    getAttendanceSummary,
    getAttendanceLogs,
    getAttendanceLogDetail,
} = require("../Controllers/attendance");

const router = express.Router();

router.post("/getAssignedClassesForAttendance", getAssignedClassesForAttendance);
router.post("/getTeachersForAttendance", getTeachersForAttendance);
router.post("/getStudentsForAttendance", getStudentsForAttendance);
router.post("/markAttendance", markAttendance);
router.post("/bulkUploadAttendance", bulkUploadAttendance);
router.post("/getAttendanceSummary", getAttendanceSummary);
router.post("/getAttendanceLogs", getAttendanceLogs);
router.post("/getAttendanceLogDetail", getAttendanceLogDetail);

module.exports = router;
