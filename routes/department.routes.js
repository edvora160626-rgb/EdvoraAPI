const express = require("express");
const { createDepartment, teachersToDepartment } = require("../Controllers/department");
const router = express.Router();

router.post("/createDepartment",createDepartment);
router.post("/teachersToDepartment",teachersToDepartment);

module.exports = router;