const express = require("express");
const {
    addClasses,
    getActiveClassesBySchool,
    getStudentsByClass,
    getActiveStaffBySchool,
    assignStaffToClass,
} = require("../Controllers/classes");
const router = express.Router();

router.post("/addClasses", addClasses);
router.post("/getActiveClassesBySchool", getActiveClassesBySchool);
router.post("/getStudentsByClass", getStudentsByClass);
router.post("/getActiveStaffBySchool", getActiveStaffBySchool);
router.post("/assignStaffToClass", assignStaffToClass);

module.exports = router;
