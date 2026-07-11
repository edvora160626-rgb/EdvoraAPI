const express = require("express");
const {
    createDepartment,
    teachersToDepartment,
    getActiveDepartmentsBySchool,
} = require("../Controllers/department");
const router = express.Router();

router.post("/createDepartment", createDepartment);
router.post("/teachersToDepartment", teachersToDepartment);
router.post("/getActiveDepartmentsBySchool", getActiveDepartmentsBySchool);

module.exports = router;