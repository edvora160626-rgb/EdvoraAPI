const express = require("express");
const {
  createAcademicYear,
  updateAcademicYear,
  listAcademicYears,
  setCurrentAcademicYear,
  getTimetableSettings,
  upsertTimetableSettings,
  listTimeSlots,
  createTimeSlot,
  updateTimeSlot,
  deleteTimeSlot,
  replaceTimeSlots,
  listHolidays,
  createHoliday,
  deleteHoliday,
  listRooms,
  createRoom,
  updateRoom,
  deleteRoom,
  upsertTeacherAvailability,
  getTeacherAvailability,
  listTeacherAvailability,
  listSubjectsByClass,
  listAllocationsByClass,
  createAllocation,
  updateAllocation,
  deleteAllocation,
  getTimetableByClass,
  upsertTimetableEntry,
  clearTimetableEntry,
  checkConflicts,
  publishTimetable,
  unpublishTimetable,
  copyTimetable,
  listDashboard,
  getTeacherTimetable,
  getRoomTimetable,
  getMyTimetable,
} = require("../Controllers/timetable");

const router = express.Router();

// Academic years
router.post("/createAcademicYear", createAcademicYear);
router.post("/updateAcademicYear", updateAcademicYear);
router.post("/listAcademicYears", listAcademicYears);
router.post("/setCurrentAcademicYear", setCurrentAcademicYear);

// Settings
router.post("/getSettings", getTimetableSettings);
router.post("/upsertSettings", upsertTimetableSettings);

// Time slots
router.post("/listTimeSlots", listTimeSlots);
router.post("/createTimeSlot", createTimeSlot);
router.post("/updateTimeSlot", updateTimeSlot);
router.post("/deleteTimeSlot", deleteTimeSlot);
router.post("/replaceTimeSlots", replaceTimeSlots);

// Holidays
router.post("/listHolidays", listHolidays);
router.post("/createHoliday", createHoliday);
router.post("/deleteHoliday", deleteHoliday);

// Rooms
router.post("/listRooms", listRooms);
router.post("/createRoom", createRoom);
router.post("/updateRoom", updateRoom);
router.post("/deleteRoom", deleteRoom);

// Teacher availability
router.post("/upsertTeacherAvailability", upsertTeacherAvailability);
router.post("/getTeacherAvailability", getTeacherAvailability);
router.post("/listTeacherAvailability", listTeacherAvailability);

// Allocations
router.post("/listSubjectsByClass", listSubjectsByClass);
router.post("/listAllocationsByClass", listAllocationsByClass);
router.post("/createAllocation", createAllocation);
router.post("/updateAllocation", updateAllocation);
router.post("/deleteAllocation", deleteAllocation);

// Timetable grid
router.post("/getTimetableByClass", getTimetableByClass);
router.post("/upsertEntry", upsertTimetableEntry);
router.post("/clearEntry", clearTimetableEntry);
router.post("/checkConflicts", checkConflicts);
router.post("/publishTimetable", publishTimetable);
router.post("/unpublishTimetable", unpublishTimetable);
router.post("/copyTimetable", copyTimetable);
router.post("/listDashboard", listDashboard);

// Views
router.post("/getTeacherTimetable", getTeacherTimetable);
router.post("/getRoomTimetable", getRoomTimetable);
router.post("/getMyTimetable", getMyTimetable);

module.exports = router;
