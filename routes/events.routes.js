const express = require("express");
const {
  createEvent,
  updateEvent,
  publishEvent,
  cancelEvent,
  deleteEvent,
  getEventsBySchool,
  getEventById,
  addProgram,
  updateProgram,
  deleteProgram,
  registerForProgram,
  cancelRegistration,
  getParticipants,
  getEventDashboardStats,
} = require("../Controllers/events");

const router = express.Router();

router.post("/createEvent", createEvent);
router.post("/updateEvent", updateEvent);
router.post("/publishEvent", publishEvent);
router.post("/cancelEvent", cancelEvent);
router.post("/deleteEvent", deleteEvent);
router.post("/getEventsBySchool", getEventsBySchool);
router.post("/getEventById", getEventById);
router.post("/addProgram", addProgram);
router.post("/updateProgram", updateProgram);
router.post("/deleteProgram", deleteProgram);
router.post("/registerForProgram", registerForProgram);
router.post("/cancelRegistration", cancelRegistration);
router.post("/getParticipants", getParticipants);
router.post("/getEventDashboardStats", getEventDashboardStats);

module.exports = router;
