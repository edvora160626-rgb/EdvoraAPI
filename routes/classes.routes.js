const express = require("express");
const {
    addClasses,
    getActiveClassesBySchool,
    getStudentsByClass,
} = require("../Controllers/classes");
const router = express.Router();

router.post("/addClasses", addClasses);
router.post("/getActiveClassesBySchool", getActiveClassesBySchool);
router.post("/getStudentsByClass", getStudentsByClass);

module.exports = router;
