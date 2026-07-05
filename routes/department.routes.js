const express = require("express");
const { createDepartment } = require("../Controllers/department");
const router = express.Router();


router.post("/createDepartment",createDepartment);



module.exports = router;