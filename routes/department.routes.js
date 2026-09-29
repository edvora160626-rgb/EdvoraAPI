const express = require("express");
const {
    createDepartment,
    updateDepartment,
    teachersToDepartment,
    getActiveDepartmentsBySchool,
    getTeachersByDepartment,
} = require("../Controllers/department");
const router = express.Router();

router.post("/createDepartment", createDepartment);
router.post("/updateDepartment", updateDepartment);
router.post("/teachersToDepartment", teachersToDepartment);
router.post("/getActiveDepartmentsBySchool", getActiveDepartmentsBySchool);
router.post("/getTeachersByDepartment", getTeachersByDepartment);

module.exports = router;