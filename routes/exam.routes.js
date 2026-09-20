const express = require("express");
const examAuth = require("../middleware/examAuth");
const {
  getDashboard,
  listTests,
  getTestDetails,
  enrollTest,
  startAttempt,
  saveAnswer,
  submitAttempt,
  getAttemptResult,
  listResults,
  listCertificates,
  listMaterials,
  listForum,
  createForumPost,
  listSupportTickets,
  createSupportTicket,
  precheck,
  getStaffOverview,
  listExamUsers,
  listQuestionsAdmin,
  createQuestionAdmin,
  updateQuestionAdmin,
  listSubjectsAdmin,
  createSubjectAdmin,
  listLiveSessions,
  listScheduledForProctor,
  listTestsAdmin,
  getTestAdmin,
  createTestAdmin,
  updateTestAdmin,
  publishTestAdmin,
} = require("../Controllers/examPortal");

const router = express.Router();

router.use(examAuth);

router.get("/dashboard", getDashboard);
router.get("/tests", listTests);
router.get("/tests/:testId", getTestDetails);
router.post("/tests/:testId/enroll", enrollTest);
router.get("/tests/:testId/precheck", precheck);
router.post("/tests/:testId/start", startAttempt);

router.post("/attempts/:attemptId/answer", saveAnswer);
router.post("/attempts/:attemptId/submit", submitAttempt);
router.get("/attempts/:attemptId/result", getAttemptResult);

router.get("/results", listResults);
router.get("/certificates", listCertificates);
router.get("/materials", listMaterials);

router.get("/forum", listForum);
router.post("/forum", createForumPost);

router.get("/support", listSupportTickets);
router.post("/support", createSupportTicket);

router.get("/staff/overview", getStaffOverview);
router.get("/staff/users", listExamUsers);
router.get("/staff/subjects", listSubjectsAdmin);
router.post("/staff/subjects", createSubjectAdmin);
router.get("/staff/questions", listQuestionsAdmin);
router.post("/staff/questions", createQuestionAdmin);
router.put("/staff/questions/:id", updateQuestionAdmin);
router.get("/staff/tests", listTestsAdmin);
router.post("/staff/tests", createTestAdmin);
router.get("/staff/tests/:id", getTestAdmin);
router.put("/staff/tests/:id", updateTestAdmin);
router.post("/staff/tests/:id/publish", publishTestAdmin);
router.get("/staff/live-sessions", listLiveSessions);
router.get("/staff/scheduled", listScheduledForProctor);

module.exports = router;
