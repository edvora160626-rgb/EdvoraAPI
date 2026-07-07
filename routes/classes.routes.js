const express = require("express");
const { addClasses, getActiveClassesBySchool } = require("../Controllers/classes");
const router = express.Router();

router.post("/addClasses",addClasses);
router.post("/getActiveClassesBySchool",getActiveClassesBySchool);

module.exports = router;