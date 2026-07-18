const express = require("express");
const {
    createDepartment,
    teachersToDepartment,
    getActiveDepartmentsBySchool,
    getTeachersByDepartment,
} = require("../Controllers/department");
const router = express.Router();

router.post("/createDepartment", createDepartment);
router.post("/teachersToDepartment", teachersToDepartment);
router.post("/getActiveDepartmentsBySchool", getActiveDepartmentsBySchool);
router.post("/getTeachersByDepartment", getTeachersByDepartment);

module.exports = router;