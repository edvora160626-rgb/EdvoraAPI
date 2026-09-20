const express = require("express");
const {
  addSubjects,
  getSubjectsBySchool,
  getSubjectsByClass,
  assignSubjectToClasses,
  updateSubject,
  updateSubjectStatus,
  deleteSubject,
} = require("../Controllers/subjects");

const router = express.Router();

router.post("/addSubjects", addSubjects);
router.post("/getSubjectsBySchool", getSubjectsBySchool);
router.post("/getSubjectsByClass", getSubjectsByClass);
router.post("/assignSubjectToClasses", assignSubjectToClasses);
router.post("/updateSubject", updateSubject);
router.post("/updateSubjectStatus", updateSubjectStatus);
router.post("/deleteSubject", deleteSubject);

module.exports = router;
