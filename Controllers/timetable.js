const mongoose = require("mongoose");
const AcademicYear = require("../models/AcademicYear.model");
const TimetableSettings = require("../models/TimetableSettings.model");
const TimeSlot = require("../models/TimeSlot.model");
const Room = require("../models/Room.model");
const Holiday = require("../models/Holiday.model");
const TeacherAvailability = require("../models/TeacherAvailability.model");
const SubjectAllocation = require("../models/SubjectAllocation.model");
const Timetable = require("../models/Timetable.model");
const Class = require("../models/Classes.model");
const Subject = require("../models/Subjects.model");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Parent = require("../models/Parent");

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const SLOT_TYPES = ["PERIOD", "BREAK", "LUNCH"];
const ROOM_TYPES = ["CLASSROOM", "LAB", "LIBRARY", "AUDITORIUM", "OTHER"];

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value);

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const serverError = (res, error, label) => {
  console.error(`${label} error:`, error);
  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
};

const requireSchoolId = (schoolId, res) => {
  if (!schoolId || !isValidId(schoolId)) {
    res.status(400).json({
      success: false,
      message: "Valid schoolId is required.",
    });
    return false;
  }
  return true;
};

const populateTimetable = (query) =>
  query
    .populate("classId", "className section")
    .populate("academicYearId", "name isCurrent")
    .populate("entries.subjectId", "subjectName subjectCode")
    .populate("entries.teacherId", "firstName lastName staffId")
    .populate("entries.roomId", "name code type")
    .populate("entries.timeSlotId", "name order startTime endTime type");

const entryKey = (day, timeSlotId) => `${day}:${String(timeSlotId)}`;

async function findConflicts({
  schoolId,
  academicYearId,
  classId,
  day,
  timeSlotId,
  teacherId,
  roomId,
  excludeTimetableId,
  softWorkload = false,
}) {
  const conflicts = [];
  const warnings = [];

  const timetables = await Timetable.find({
    schoolId,
    academicYearId,
    ...(excludeTimetableId ? { _id: { $ne: excludeTimetableId } } : {}),
  })
    .populate("classId", "className section")
    .lean();

  const sameClass = await Timetable.findOne({
    schoolId,
    academicYearId,
    classId,
  }).lean();

  if (sameClass) {
    const clash = (sameClass.entries || []).find(
      (e) =>
        e.day === day &&
        String(e.timeSlotId) === String(timeSlotId) &&
        (!excludeTimetableId || true)
    );
    // Same-class slot clash is handled as overwrite in upsert; report only if checking
    if (clash && teacherId) {
      // no-op for same class — overwrite path
    }
  }

  for (const tt of timetables) {
    for (const entry of tt.entries || []) {
      if (entry.day !== day || String(entry.timeSlotId) !== String(timeSlotId)) {
        continue;
      }
      const classLabel = tt.classId
        ? `${tt.classId.className} ${tt.classId.section}`
        : "Another class";

      if (
        teacherId &&
        entry.teacherId &&
        String(entry.teacherId) === String(teacherId) &&
        String(tt.classId?._id || tt.classId) !== String(classId)
      ) {
        conflicts.push({
          type: "TEACHER",
          message: `Teacher already assigned to ${classLabel} in this period.`,
        });
      }

      if (
        roomId &&
        entry.roomId &&
        String(entry.roomId) === String(roomId) &&
        String(tt.classId?._id || tt.classId) !== String(classId)
      ) {
        conflicts.push({
          type: "ROOM",
          message: `Room already booked by ${classLabel} in this period.`,
        });
      }
    }
  }

  // Also check same timetable other entries for teacher/room (shouldn't happen same slot)
  // Workload check
  if (teacherId) {
    const availability = await TeacherAvailability.findOne({
      schoolId,
      academicYearId,
      teacherId,
    }).lean();

    const maxPerDay = availability?.maxPeriodsPerDay || 6;
    let count = 0;

    for (const tt of timetables) {
      for (const entry of tt.entries || []) {
        if (
          entry.day === day &&
          entry.teacherId &&
          String(entry.teacherId) === String(teacherId)
        ) {
          // exclude the slot being replaced on this class
          if (
            String(tt.classId?._id || tt.classId) === String(classId) &&
            String(entry.timeSlotId) === String(timeSlotId)
          ) {
            continue;
          }
          count += 1;
        }
      }
    }
    // include the new assignment
    count += 1;

    if (count > maxPerDay) {
      const item = {
        type: "WORKLOAD",
        message: `Teacher would have ${count} periods on ${day} (max ${maxPerDay}).`,
      };
      if (softWorkload) warnings.push(item);
      else conflicts.push(item);
    }

    if (
      availability?.workingDays?.length &&
      !availability.workingDays.includes(day)
    ) {
      conflicts.push({
        type: "AVAILABILITY",
        message: `Teacher is not available on ${day}.`,
      });
    }
  }

  return { conflicts, warnings };
}

async function collectPublishConflicts(schoolId, academicYearId, timetable) {
  const conflicts = [];
  const warnings = [];
  const periodSlots = await TimeSlot.find({
    schoolId,
    academicYearId,
    type: "PERIOD",
  })
    .select("_id")
    .lean();
  const periodIds = new Set(periodSlots.map((s) => String(s._id)));

  for (const entry of timetable.entries || []) {
    if (!periodIds.has(String(entry.timeSlotId))) continue;
    if (!entry.teacherId && !entry.subjectId) continue;

    const result = await findConflicts({
      schoolId,
      academicYearId,
      classId: timetable.classId,
      day: entry.day,
      timeSlotId: entry.timeSlotId,
      teacherId: entry.teacherId,
      roomId: entry.roomId,
      excludeTimetableId: timetable._id,
      softWorkload: false,
    });

    // Re-check teacher/room against OTHER classes only — findConflicts already does that
    // But findConflicts also checks workload counting other entries; for publish we need
    // to not double-count. Use a lighter check for publish:

    for (const c of result.conflicts) {
      if (c.type === "TEACHER" || c.type === "ROOM" || c.type === "AVAILABILITY") {
        conflicts.push({ ...c, day: entry.day, timeSlotId: entry.timeSlotId });
      }
    }
  }

  // Workload per teacher per day across this + others
  const teacherDayCount = {};
  const allTts = await Timetable.find({ schoolId, academicYearId }).lean();

  for (const tt of allTts) {
    const isSelf = String(tt._id) === String(timetable._id);
    const entries = isSelf ? timetable.entries : tt.entries;
    for (const entry of entries || []) {
      if (!entry.teacherId || !periodIds.has(String(entry.timeSlotId))) continue;
      const key = `${entry.teacherId}:${entry.day}`;
      teacherDayCount[key] = (teacherDayCount[key] || 0) + 1;
    }
  }

  const availMap = {};
  const availDocs = await TeacherAvailability.find({
    schoolId,
    academicYearId,
  }).lean();
  for (const a of availDocs) {
    availMap[String(a.teacherId)] = a;
  }

  for (const [key, count] of Object.entries(teacherDayCount)) {
    const [teacherId, day] = key.split(":");
    const max = availMap[teacherId]?.maxPeriodsPerDay || 6;
    if (count > max) {
      conflicts.push({
        type: "WORKLOAD",
        message: `Teacher exceeds max periods on ${day} (${count}/${max}).`,
        teacherId,
        day,
      });
    }
  }

  // Duplicate teacher/room within same day+slot across classes
  const teacherSlot = {};
  const roomSlot = {};
  for (const tt of allTts) {
    const entries =
      String(tt._id) === String(timetable._id) ? timetable.entries : tt.entries;
    for (const entry of entries || []) {
      if (!periodIds.has(String(entry.timeSlotId))) continue;
      const slotKey = entryKey(entry.day, entry.timeSlotId);
      if (entry.teacherId) {
        const tKey = `${entry.teacherId}:${slotKey}`;
        if (teacherSlot[tKey] && teacherSlot[tKey] !== String(tt.classId)) {
          conflicts.push({
            type: "TEACHER",
            message: `Teacher double-booked on ${entry.day} for this period.`,
            day: entry.day,
            timeSlotId: entry.timeSlotId,
          });
        }
        teacherSlot[tKey] = String(
          String(tt._id) === String(timetable._id)
            ? timetable.classId
            : tt.classId
        );
      }
      if (entry.roomId) {
        const rKey = `${entry.roomId}:${slotKey}`;
        if (roomSlot[rKey] && roomSlot[rKey] !== String(tt.classId)) {
          conflicts.push({
            type: "ROOM",
            message: `Room double-booked on ${entry.day} for this period.`,
            day: entry.day,
            timeSlotId: entry.timeSlotId,
          });
        }
        roomSlot[rKey] = String(
          String(tt._id) === String(timetable._id)
            ? timetable.classId
            : tt.classId
        );
      }
    }
  }

  return { conflicts, warnings };
}

/* ===================== Academic Year ===================== */

const createAcademicYear = async (req, res) => {
  try {
    const { schoolId, name, startDate, endDate, isCurrent, createdBy } =
      req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "name, startDate and endDate are required.",
      });
    }
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end || end < start) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range.",
      });
    }

    if (isCurrent) {
      await AcademicYear.updateMany(
        { schoolId, isCurrent: true },
        { $set: { isCurrent: false } }
      );
    }

    const year = await AcademicYear.create({
      schoolId,
      name: name.trim(),
      startDate: start,
      endDate: end,
      isCurrent: Boolean(isCurrent),
      createdBy: createdBy || null,
    });

    return res.status(201).json({
      success: true,
      message: "Academic year created successfully.",
      data: year,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Academic year with this name already exists.",
      });
    }
    return serverError(res, error, "createAcademicYear");
  }
};

const updateAcademicYear = async (req, res) => {
  try {
    const {
      schoolId,
      academicYearId,
      name,
      startDate,
      endDate,
      status,
      updatedBy,
    } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !isValidId(academicYearId)) {
      return res.status(400).json({
        success: false,
        message: "Valid academicYearId is required.",
      });
    }

    const year = await AcademicYear.findOne({ _id: academicYearId, schoolId });
    if (!year) {
      return res.status(404).json({
        success: false,
        message: "Academic year not found.",
      });
    }

    if (name !== undefined) year.name = name.trim();
    if (startDate !== undefined) {
      const start = parseDate(startDate);
      if (!start) {
        return res.status(400).json({
          success: false,
          message: "Invalid startDate.",
        });
      }
      year.startDate = start;
    }
    if (endDate !== undefined) {
      const end = parseDate(endDate);
      if (!end) {
        return res.status(400).json({
          success: false,
          message: "Invalid endDate.",
        });
      }
      year.endDate = end;
    }
    if (status && ["ACTIVE", "INACTIVE"].includes(status)) year.status = status;
    year.updatedBy = updatedBy || null;
    await year.save();

    return res.status(200).json({
      success: true,
      message: "Academic year updated successfully.",
      data: year,
    });
  } catch (error) {
    return serverError(res, error, "updateAcademicYear");
  }
};

const listAcademicYears = async (req, res) => {
  try {
    const { schoolId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;

    const years = await AcademicYear.find({ schoolId })
      .sort({ isCurrent: -1, startDate: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      message: "Academic years fetched successfully.",
      data: years,
    });
  } catch (error) {
    return serverError(res, error, "listAcademicYears");
  }
};

const setCurrentAcademicYear = async (req, res) => {
  try {
    const { schoolId, academicYearId, updatedBy } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !isValidId(academicYearId)) {
      return res.status(400).json({
        success: false,
        message: "Valid academicYearId is required.",
      });
    }

    const year = await AcademicYear.findOne({ _id: academicYearId, schoolId });
    if (!year) {
      return res.status(404).json({
        success: false,
        message: "Academic year not found.",
      });
    }

    await AcademicYear.updateMany(
      { schoolId, isCurrent: true },
      { $set: { isCurrent: false } }
    );
    year.isCurrent = true;
    year.updatedBy = updatedBy || null;
    await year.save();

    return res.status(200).json({
      success: true,
      message: "Current academic year updated.",
      data: year,
    });
  } catch (error) {
    return serverError(res, error, "setCurrentAcademicYear");
  }
};

/* ===================== Settings ===================== */

const getTimetableSettings = async (req, res) => {
  try {
    const { schoolId, academicYearId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !isValidId(academicYearId)) {
      return res.status(400).json({
        success: false,
        message: "Valid academicYearId is required.",
      });
    }

    let settings = await TimetableSettings.findOne({
      schoolId,
      academicYearId,
    }).lean();

    if (!settings) {
      settings = {
        schoolId,
        academicYearId,
        workingDays: ["MON", "TUE", "WED", "THU", "FRI"],
        schoolStart: "08:00",
        schoolEnd: "15:00",
        defaultPeriodMinutes: 45,
      };
    }

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    return serverError(res, error, "getTimetableSettings");
  }
};

const upsertTimetableSettings = async (req, res) => {
  try {
    const {
      schoolId,
      academicYearId,
      workingDays,
      schoolStart,
      schoolEnd,
      defaultPeriodMinutes,
      updatedBy,
    } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !isValidId(academicYearId)) {
      return res.status(400).json({
        success: false,
        message: "Valid academicYearId is required.",
      });
    }

    const days = Array.isArray(workingDays)
      ? workingDays.filter((d) => DAYS.includes(d))
      : ["MON", "TUE", "WED", "THU", "FRI"];

    const settings = await TimetableSettings.findOneAndUpdate(
      { schoolId, academicYearId },
      {
        $set: {
          workingDays: days.length ? days : ["MON", "TUE", "WED", "THU", "FRI"],
          schoolStart: schoolStart || "08:00",
          schoolEnd: schoolEnd || "15:00",
          defaultPeriodMinutes: defaultPeriodMinutes || 45,
          updatedBy: updatedBy || null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Timetable settings saved.",
      data: settings,
    });
  } catch (error) {
    return serverError(res, error, "upsertTimetableSettings");
  }
};

/* ===================== Time Slots ===================== */

const listTimeSlots = async (req, res) => {
  try {
    const { schoolId, academicYearId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !isValidId(academicYearId)) {
      return res.status(400).json({
        success: false,
        message: "Valid academicYearId is required.",
      });
    }

    const slots = await TimeSlot.find({ schoolId, academicYearId })
      .sort({ order: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: slots,
    });
  } catch (error) {
    return serverError(res, error, "listTimeSlots");
  }
};

const createTimeSlot = async (req, res) => {
  try {
    const {
      schoolId,
      academicYearId,
      name,
      order,
      startTime,
      endTime,
      type,
      createdBy,
    } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !name || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message:
          "academicYearId, name, startTime and endTime are required.",
      });
    }

    const slotType = type || "PERIOD";
    if (!SLOT_TYPES.includes(slotType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid slot type.",
      });
    }

    let slotOrder = order;
    if (slotOrder === undefined || slotOrder === null) {
      const last = await TimeSlot.findOne({ schoolId, academicYearId })
        .sort({ order: -1 })
        .select("order")
        .lean();
      slotOrder = (last?.order ?? -1) + 1;
    }

    const slot = await TimeSlot.create({
      schoolId,
      academicYearId,
      name: name.trim(),
      order: slotOrder,
      startTime: startTime.trim(),
      endTime: endTime.trim(),
      type: slotType,
      createdBy: createdBy || null,
    });

    return res.status(201).json({
      success: true,
      message: "Time slot created.",
      data: slot,
    });
  } catch (error) {
    return serverError(res, error, "createTimeSlot");
  }
};

const updateTimeSlot = async (req, res) => {
  try {
    const {
      schoolId,
      timeSlotId,
      name,
      order,
      startTime,
      endTime,
      type,
      updatedBy,
    } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!timeSlotId || !isValidId(timeSlotId)) {
      return res.status(400).json({
        success: false,
        message: "Valid timeSlotId is required.",
      });
    }

    const slot = await TimeSlot.findOne({ _id: timeSlotId, schoolId });
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: "Time slot not found.",
      });
    }

    if (name !== undefined) slot.name = name.trim();
    if (order !== undefined) slot.order = order;
    if (startTime !== undefined) slot.startTime = startTime.trim();
    if (endTime !== undefined) slot.endTime = endTime.trim();
    if (type !== undefined) {
      if (!SLOT_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid slot type.",
        });
      }
      slot.type = type;
    }
    slot.updatedBy = updatedBy || null;
    await slot.save();

    return res.status(200).json({
      success: true,
      message: "Time slot updated.",
      data: slot,
    });
  } catch (error) {
    return serverError(res, error, "updateTimeSlot");
  }
};

const deleteTimeSlot = async (req, res) => {
  try {
    const { schoolId, timeSlotId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!timeSlotId || !isValidId(timeSlotId)) {
      return res.status(400).json({
        success: false,
        message: "Valid timeSlotId is required.",
      });
    }

    const deleted = await TimeSlot.findOneAndDelete({
      _id: timeSlotId,
      schoolId,
    });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Time slot not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Time slot deleted.",
    });
  } catch (error) {
    return serverError(res, error, "deleteTimeSlot");
  }
};

const replaceTimeSlots = async (req, res) => {
  try {
    const { schoolId, academicYearId, slots, createdBy } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !isValidId(academicYearId)) {
      return res.status(400).json({
        success: false,
        message: "Valid academicYearId is required.",
      });
    }
    if (!Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({
        success: false,
        message: "slots array is required.",
      });
    }

    await TimeSlot.deleteMany({ schoolId, academicYearId });

    const docs = slots.map((s, index) => ({
      schoolId,
      academicYearId,
      name: String(s.name || `Period ${index + 1}`).trim(),
      order: s.order ?? index,
      startTime: String(s.startTime || "").trim(),
      endTime: String(s.endTime || "").trim(),
      type: SLOT_TYPES.includes(s.type) ? s.type : "PERIOD",
      createdBy: createdBy || null,
    }));

    const created = await TimeSlot.insertMany(docs);

    return res.status(200).json({
      success: true,
      message: "Time slots replaced.",
      data: created,
    });
  } catch (error) {
    return serverError(res, error, "replaceTimeSlots");
  }
};

/* ===================== Holidays ===================== */

const listHolidays = async (req, res) => {
  try {
    const { schoolId, academicYearId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !isValidId(academicYearId)) {
      return res.status(400).json({
        success: false,
        message: "Valid academicYearId is required.",
      });
    }

    const holidays = await Holiday.find({ schoolId, academicYearId })
      .sort({ date: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: holidays,
    });
  } catch (error) {
    return serverError(res, error, "listHolidays");
  }
};

const createHoliday = async (req, res) => {
  try {
    const { schoolId, academicYearId, date, name, type, createdBy } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !date || !name) {
      return res.status(400).json({
        success: false,
        message: "academicYearId, date and name are required.",
      });
    }
    const parsed = parseDate(date);
    if (!parsed) {
      return res.status(400).json({
        success: false,
        message: "Invalid date.",
      });
    }

    const holiday = await Holiday.create({
      schoolId,
      academicYearId,
      date: parsed,
      name: name.trim(),
      type: type === "SPECIAL_WORKING" ? "SPECIAL_WORKING" : "HOLIDAY",
      createdBy: createdBy || null,
    });

    return res.status(201).json({
      success: true,
      message: "Holiday created.",
      data: holiday,
    });
  } catch (error) {
    return serverError(res, error, "createHoliday");
  }
};

const deleteHoliday = async (req, res) => {
  try {
    const { schoolId, holidayId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!holidayId || !isValidId(holidayId)) {
      return res.status(400).json({
        success: false,
        message: "Valid holidayId is required.",
      });
    }

    const deleted = await Holiday.findOneAndDelete({
      _id: holidayId,
      schoolId,
    });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Holiday not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Holiday deleted.",
    });
  } catch (error) {
    return serverError(res, error, "deleteHoliday");
  }
};

/* ===================== Rooms ===================== */

const listRooms = async (req, res) => {
  try {
    const { schoolId, status } = req.body;
    if (!requireSchoolId(schoolId, res)) return;

    const filter = { schoolId };
    if (status && ["ACTIVE", "INACTIVE"].includes(status)) {
      filter.status = status;
    }

    const rooms = await Room.find(filter).sort({ name: 1 }).lean();
    const [active, inactive] = await Promise.all([
      Room.countDocuments({ schoolId, status: "ACTIVE" }),
      Room.countDocuments({ schoolId, status: "INACTIVE" }),
    ]);

    return res.status(200).json({
      success: true,
      data: rooms,
      counts: { ACTIVE: active, INACTIVE: inactive },
    });
  } catch (error) {
    return serverError(res, error, "listRooms");
  }
};

const createRoom = async (req, res) => {
  try {
    const { schoolId, name, code, type, capacity, createdBy } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: "name and code are required.",
      });
    }

    const roomType = type || "CLASSROOM";
    if (!ROOM_TYPES.includes(roomType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid room type.",
      });
    }

    const room = await Room.create({
      schoolId,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      type: roomType,
      capacity: capacity || 40,
      createdBy: createdBy || null,
    });

    return res.status(201).json({
      success: true,
      message: "Room created.",
      data: room,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Room code already exists.",
      });
    }
    return serverError(res, error, "createRoom");
  }
};

const updateRoom = async (req, res) => {
  try {
    const { schoolId, roomId, name, code, type, capacity, status, updatedBy } =
      req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!roomId || !isValidId(roomId)) {
      return res.status(400).json({
        success: false,
        message: "Valid roomId is required.",
      });
    }

    const room = await Room.findOne({ _id: roomId, schoolId });
    if (!room) {
      return res.status(404).json({
        success: false,
        message: "Room not found.",
      });
    }

    if (name !== undefined) room.name = name.trim();
    if (code !== undefined) room.code = code.trim().toUpperCase();
    if (type !== undefined) {
      if (!ROOM_TYPES.includes(type)) {
        return res.status(400).json({
          success: false,
          message: "Invalid room type.",
        });
      }
      room.type = type;
    }
    if (capacity !== undefined) room.capacity = capacity;
    if (status && ["ACTIVE", "INACTIVE"].includes(status)) room.status = status;
    room.updatedBy = updatedBy || null;
    await room.save();

    return res.status(200).json({
      success: true,
      message: "Room updated.",
      data: room,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Room code already exists.",
      });
    }
    return serverError(res, error, "updateRoom");
  }
};

const deleteRoom = async (req, res) => {
  try {
    const { schoolId, roomId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!roomId || !isValidId(roomId)) {
      return res.status(400).json({
        success: false,
        message: "Valid roomId is required.",
      });
    }

    const deleted = await Room.findOneAndDelete({ _id: roomId, schoolId });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Room not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Room deleted.",
    });
  } catch (error) {
    return serverError(res, error, "deleteRoom");
  }
};

/* ===================== Teacher Availability ===================== */

const upsertTeacherAvailability = async (req, res) => {
  try {
    const {
      schoolId,
      academicYearId,
      teacherId,
      workingDays,
      maxPeriodsPerDay,
      updatedBy,
    } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (
      !academicYearId ||
      !teacherId ||
      !isValidId(academicYearId) ||
      !isValidId(teacherId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid academicYearId and teacherId are required.",
      });
    }

    const days = Array.isArray(workingDays)
      ? workingDays.filter((d) => DAYS.includes(d))
      : ["MON", "TUE", "WED", "THU", "FRI"];

    const doc = await TeacherAvailability.findOneAndUpdate(
      { schoolId, academicYearId, teacherId },
      {
        $set: {
          workingDays: days.length ? days : ["MON", "TUE", "WED", "THU", "FRI"],
          maxPeriodsPerDay: maxPeriodsPerDay || 6,
          updatedBy: updatedBy || null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({
      success: true,
      message: "Teacher availability saved.",
      data: doc,
    });
  } catch (error) {
    return serverError(res, error, "upsertTeacherAvailability");
  }
};

const getTeacherAvailability = async (req, res) => {
  try {
    const { schoolId, academicYearId, teacherId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !teacherId) {
      return res.status(400).json({
        success: false,
        message: "academicYearId and teacherId are required.",
      });
    }

    let doc = await TeacherAvailability.findOne({
      schoolId,
      academicYearId,
      teacherId,
    }).lean();

    if (!doc) {
      doc = {
        schoolId,
        academicYearId,
        teacherId,
        workingDays: ["MON", "TUE", "WED", "THU", "FRI"],
        maxPeriodsPerDay: 6,
      };
    }

    return res.status(200).json({
      success: true,
      data: doc,
    });
  } catch (error) {
    return serverError(res, error, "getTeacherAvailability");
  }
};

const listTeacherAvailability = async (req, res) => {
  try {
    const { schoolId, academicYearId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !isValidId(academicYearId)) {
      return res.status(400).json({
        success: false,
        message: "Valid academicYearId is required.",
      });
    }

    const docs = await TeacherAvailability.find({ schoolId, academicYearId })
      .populate("teacherId", "firstName lastName staffId")
      .lean();

    return res.status(200).json({
      success: true,
      data: docs,
    });
  } catch (error) {
    return serverError(res, error, "listTeacherAvailability");
  }
};

/* ===================== Subject Allocations ===================== */

const listSubjectsByClass = async (req, res) => {
  try {
    const { schoolId, classId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!classId || !isValidId(classId)) {
      return res.status(400).json({
        success: false,
        message: "Valid classId is required.",
      });
    }

    const subjects = await Subject.find({
      schoolId,
      classId,
      status: "ACTIVE",
    })
      .sort({ subjectName: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: subjects,
    });
  } catch (error) {
    return serverError(res, error, "listSubjectsByClass");
  }
};

const listAllocationsByClass = async (req, res) => {
  try {
    const { schoolId, academicYearId, classId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !classId) {
      return res.status(400).json({
        success: false,
        message: "academicYearId and classId are required.",
      });
    }

    const allocations = await SubjectAllocation.find({
      schoolId,
      academicYearId,
      classId,
    })
      .populate("subjectId", "subjectName subjectCode")
      .populate("teacherId", "firstName lastName staffId")
      .lean();

    return res.status(200).json({
      success: true,
      data: allocations,
    });
  } catch (error) {
    return serverError(res, error, "listAllocationsByClass");
  }
};

const createAllocation = async (req, res) => {
  try {
    const {
      schoolId,
      academicYearId,
      classId,
      subjectId,
      teacherId,
      periodsPerWeek,
      preferredRoomType,
      createdBy,
    } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !classId || !subjectId || !teacherId) {
      return res.status(400).json({
        success: false,
        message:
          "academicYearId, classId, subjectId and teacherId are required.",
      });
    }

    const allocation = await SubjectAllocation.create({
      schoolId,
      academicYearId,
      classId,
      subjectId,
      teacherId,
      periodsPerWeek: periodsPerWeek || 5,
      preferredRoomType: preferredRoomType || "",
      createdBy: createdBy || null,
    });

    const populated = await SubjectAllocation.findById(allocation._id)
      .populate("subjectId", "subjectName subjectCode")
      .populate("teacherId", "firstName lastName staffId");

    return res.status(201).json({
      success: true,
      message: "Subject allocation created.",
      data: populated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This subject is already allocated for the class.",
      });
    }
    return serverError(res, error, "createAllocation");
  }
};

const updateAllocation = async (req, res) => {
  try {
    const {
      schoolId,
      allocationId,
      teacherId,
      periodsPerWeek,
      preferredRoomType,
      updatedBy,
    } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!allocationId || !isValidId(allocationId)) {
      return res.status(400).json({
        success: false,
        message: "Valid allocationId is required.",
      });
    }

    const allocation = await SubjectAllocation.findOne({
      _id: allocationId,
      schoolId,
    });
    if (!allocation) {
      return res.status(404).json({
        success: false,
        message: "Allocation not found.",
      });
    }

    if (teacherId !== undefined) allocation.teacherId = teacherId;
    if (periodsPerWeek !== undefined)
      allocation.periodsPerWeek = periodsPerWeek;
    if (preferredRoomType !== undefined)
      allocation.preferredRoomType = preferredRoomType;
    allocation.updatedBy = updatedBy || null;
    await allocation.save();

    const populated = await SubjectAllocation.findById(allocation._id)
      .populate("subjectId", "subjectName subjectCode")
      .populate("teacherId", "firstName lastName staffId");

    return res.status(200).json({
      success: true,
      message: "Allocation updated.",
      data: populated,
    });
  } catch (error) {
    return serverError(res, error, "updateAllocation");
  }
};

const deleteAllocation = async (req, res) => {
  try {
    const { schoolId, allocationId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!allocationId || !isValidId(allocationId)) {
      return res.status(400).json({
        success: false,
        message: "Valid allocationId is required.",
      });
    }

    const deleted = await SubjectAllocation.findOneAndDelete({
      _id: allocationId,
      schoolId,
    });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Allocation not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Allocation deleted.",
    });
  } catch (error) {
    return serverError(res, error, "deleteAllocation");
  }
};

/* ===================== Timetable Grid ===================== */

const getOrCreateTimetable = async (schoolId, academicYearId, classId, createdBy) => {
  let tt = await Timetable.findOne({ schoolId, academicYearId, classId });
  if (!tt) {
    tt = await Timetable.create({
      schoolId,
      academicYearId,
      classId,
      status: "DRAFT",
      entries: [],
      createdBy: createdBy || null,
    });
  }
  return tt;
};

const getTimetableByClass = async (req, res) => {
  try {
    const { schoolId, academicYearId, classId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !classId) {
      return res.status(400).json({
        success: false,
        message: "academicYearId and classId are required.",
      });
    }

    await getOrCreateTimetable(schoolId, academicYearId, classId);

    const tt = await populateTimetable(
      Timetable.findOne({ schoolId, academicYearId, classId })
    );

    const [settings, slots, allocations] = await Promise.all([
      TimetableSettings.findOne({ schoolId, academicYearId }).lean(),
      TimeSlot.find({ schoolId, academicYearId }).sort({ order: 1 }).lean(),
      SubjectAllocation.find({ schoolId, academicYearId, classId })
        .populate("subjectId", "subjectName subjectCode")
        .populate("teacherId", "firstName lastName staffId")
        .lean(),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        timetable: tt,
        settings: settings || {
          workingDays: ["MON", "TUE", "WED", "THU", "FRI"],
        },
        slots,
        allocations,
      },
    });
  } catch (error) {
    return serverError(res, error, "getTimetableByClass");
  }
};

const upsertTimetableEntry = async (req, res) => {
  try {
    const {
      schoolId,
      academicYearId,
      classId,
      day,
      timeSlotId,
      subjectId,
      teacherId,
      roomId,
      isPractical,
      overwrite,
      updatedBy,
    } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !classId || !day || !timeSlotId) {
      return res.status(400).json({
        success: false,
        message: "academicYearId, classId, day and timeSlotId are required.",
      });
    }
    if (!DAYS.includes(day)) {
      return res.status(400).json({
        success: false,
        message: "Invalid day.",
      });
    }

    const slot = await TimeSlot.findOne({ _id: timeSlotId, schoolId });
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: "Time slot not found.",
      });
    }
    if (slot.type !== "PERIOD") {
      return res.status(400).json({
        success: false,
        message: "Cannot assign subjects to break/lunch slots.",
      });
    }

    const tt = await getOrCreateTimetable(
      schoolId,
      academicYearId,
      classId,
      updatedBy
    );

    const existingIdx = (tt.entries || []).findIndex(
      (e) => e.day === day && String(e.timeSlotId) === String(timeSlotId)
    );

    if (existingIdx >= 0 && !overwrite) {
      return res.status(409).json({
        success: false,
        message: "Slot already filled. Set overwrite=true to replace.",
        data: { existing: tt.entries[existingIdx] },
      });
    }

    const { conflicts, warnings } = await findConflicts({
      schoolId,
      academicYearId,
      classId,
      day,
      timeSlotId,
      teacherId: teacherId || null,
      roomId: roomId || null,
      excludeTimetableId: tt._id,
      softWorkload: true,
    });

    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Conflicts detected.",
        conflicts,
        warnings,
      });
    }

    const entry = {
      day,
      timeSlotId,
      subjectId: subjectId || null,
      teacherId: teacherId || null,
      roomId: roomId || null,
      isPractical: Boolean(isPractical),
    };

    if (existingIdx >= 0) {
      tt.entries[existingIdx] = {
        ...tt.entries[existingIdx].toObject?.() || tt.entries[existingIdx],
        ...entry,
      };
    } else {
      tt.entries.push(entry);
    }

    if (tt.status === "PUBLISHED") {
      tt.status = "DRAFT";
      tt.publishedAt = null;
    }
    tt.updatedBy = updatedBy || null;
    await tt.save();

    const populated = await populateTimetable(Timetable.findById(tt._id));

    return res.status(200).json({
      success: true,
      message: "Timetable entry saved.",
      data: populated,
      warnings,
    });
  } catch (error) {
    return serverError(res, error, "upsertTimetableEntry");
  }
};

const clearTimetableEntry = async (req, res) => {
  try {
    const { schoolId, academicYearId, classId, day, timeSlotId, updatedBy } =
      req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !classId || !day || !timeSlotId) {
      return res.status(400).json({
        success: false,
        message: "academicYearId, classId, day and timeSlotId are required.",
      });
    }

    const tt = await Timetable.findOne({ schoolId, academicYearId, classId });
    if (!tt) {
      return res.status(404).json({
        success: false,
        message: "Timetable not found.",
      });
    }

    tt.entries = (tt.entries || []).filter(
      (e) => !(e.day === day && String(e.timeSlotId) === String(timeSlotId))
    );
    if (tt.status === "PUBLISHED") {
      tt.status = "DRAFT";
      tt.publishedAt = null;
    }
    tt.updatedBy = updatedBy || null;
    await tt.save();

    const populated = await populateTimetable(Timetable.findById(tt._id));

    return res.status(200).json({
      success: true,
      message: "Entry cleared.",
      data: populated,
    });
  } catch (error) {
    return serverError(res, error, "clearTimetableEntry");
  }
};

const checkConflicts = async (req, res) => {
  try {
    const {
      schoolId,
      academicYearId,
      classId,
      day,
      timeSlotId,
      teacherId,
      roomId,
    } = req.body;
    if (!requireSchoolId(schoolId, res)) return;

    const tt = await Timetable.findOne({
      schoolId,
      academicYearId,
      classId,
    }).lean();

    const result = await findConflicts({
      schoolId,
      academicYearId,
      classId,
      day,
      timeSlotId,
      teacherId,
      roomId,
      excludeTimetableId: tt?._id,
      softWorkload: true,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return serverError(res, error, "checkConflicts");
  }
};

const publishTimetable = async (req, res) => {
  try {
    const { schoolId, academicYearId, classId, updatedBy } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !classId) {
      return res.status(400).json({
        success: false,
        message: "academicYearId and classId are required.",
      });
    }

    const tt = await Timetable.findOne({ schoolId, academicYearId, classId });
    if (!tt) {
      return res.status(404).json({
        success: false,
        message: "Timetable not found.",
      });
    }

    const { conflicts } = await collectPublishConflicts(
      schoolId,
      academicYearId,
      tt
    );

    // Deduplicate conflict messages
    const unique = [];
    const seen = new Set();
    for (const c of conflicts) {
      const key = `${c.type}:${c.message}:${c.day || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(c);
      }
    }

    if (unique.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Cannot publish due to conflicts.",
        conflicts: unique,
      });
    }

    tt.status = "PUBLISHED";
    tt.publishedAt = new Date();
    tt.updatedBy = updatedBy || null;
    await tt.save();

    const populated = await populateTimetable(Timetable.findById(tt._id));

    return res.status(200).json({
      success: true,
      message: "Timetable published.",
      data: populated,
    });
  } catch (error) {
    return serverError(res, error, "publishTimetable");
  }
};

const unpublishTimetable = async (req, res) => {
  try {
    const { schoolId, academicYearId, classId, updatedBy } = req.body;
    if (!requireSchoolId(schoolId, res)) return;

    const tt = await Timetable.findOne({ schoolId, academicYearId, classId });
    if (!tt) {
      return res.status(404).json({
        success: false,
        message: "Timetable not found.",
      });
    }

    tt.status = "DRAFT";
    tt.publishedAt = null;
    tt.updatedBy = updatedBy || null;
    await tt.save();

    const populated = await populateTimetable(Timetable.findById(tt._id));

    return res.status(200).json({
      success: true,
      message: "Timetable unpublished.",
      data: populated,
    });
  } catch (error) {
    return serverError(res, error, "unpublishTimetable");
  }
};

const copyTimetable = async (req, res) => {
  try {
    const {
      schoolId,
      academicYearId,
      sourceClassId,
      targetClassId,
      createdBy,
    } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !sourceClassId || !targetClassId) {
      return res.status(400).json({
        success: false,
        message:
          "academicYearId, sourceClassId and targetClassId are required.",
      });
    }

    const source = await Timetable.findOne({
      schoolId,
      academicYearId,
      classId: sourceClassId,
    }).lean();
    if (!source) {
      return res.status(404).json({
        success: false,
        message: "Source timetable not found.",
      });
    }

    const entries = (source.entries || []).map((e) => ({
      day: e.day,
      timeSlotId: e.timeSlotId,
      subjectId: e.subjectId,
      teacherId: e.teacherId,
      roomId: e.roomId,
      isPractical: e.isPractical,
    }));

    const target = await Timetable.findOneAndUpdate(
      { schoolId, academicYearId, classId: targetClassId },
      {
        $set: {
          entries,
          status: "DRAFT",
          publishedAt: null,
          updatedBy: createdBy || null,
        },
        $setOnInsert: {
          createdBy: createdBy || null,
        },
      },
      { upsert: true, new: true }
    );

    const populated = await populateTimetable(Timetable.findById(target._id));

    return res.status(200).json({
      success: true,
      message: "Timetable copied.",
      data: populated,
    });
  } catch (error) {
    return serverError(res, error, "copyTimetable");
  }
};

const listDashboard = async (req, res) => {
  try {
    const { schoolId, academicYearId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;

    let yearId = academicYearId;
    if (!yearId) {
      const current = await AcademicYear.findOne({
        schoolId,
        isCurrent: true,
      }).lean();
      yearId = current?._id;
    }

    if (!yearId) {
      return res.status(200).json({
        success: true,
        data: {
          academicYear: null,
          counts: { DRAFT: 0, PUBLISHED: 0, TOTAL: 0 },
          drafts: [],
          rooms: 0,
          slots: 0,
          classes: [],
        },
      });
    }

    const [draft, published, rooms, slots, classes, drafts, year] =
      await Promise.all([
        Timetable.countDocuments({
          schoolId,
          academicYearId: yearId,
          status: "DRAFT",
        }),
        Timetable.countDocuments({
          schoolId,
          academicYearId: yearId,
          status: "PUBLISHED",
        }),
        Room.countDocuments({ schoolId, status: "ACTIVE" }),
        TimeSlot.countDocuments({ schoolId, academicYearId: yearId }),
        Class.find({ schoolId, status: "ACTIVE" })
          .select("className section")
          .sort({ className: 1, section: 1 })
          .lean(),
        Timetable.find({
          schoolId,
          academicYearId: yearId,
          status: "DRAFT",
        })
          .populate("classId", "className section")
          .sort({ updatedAt: -1 })
          .limit(8)
          .lean(),
        AcademicYear.findById(yearId).lean(),
      ]);

    const ttMap = {};
    const allTt = await Timetable.find({
      schoolId,
      academicYearId: yearId,
    })
      .select("classId status")
      .lean();
    for (const t of allTt) {
      ttMap[String(t.classId)] = t.status;
    }

    const classList = classes.map((c) => ({
      ...c,
      timetableStatus: ttMap[String(c._id)] || null,
    }));

    return res.status(200).json({
      success: true,
      data: {
        academicYear: year,
        counts: {
          DRAFT: draft,
          PUBLISHED: published,
          TOTAL: draft + published,
        },
        drafts,
        rooms,
        slots,
        classes: classList,
      },
    });
  } catch (error) {
    return serverError(res, error, "listDashboard");
  }
};

/* ===================== Views ===================== */

const buildGridPayload = async (schoolId, academicYearId, entries) => {
  const [settings, slots] = await Promise.all([
    TimetableSettings.findOne({ schoolId, academicYearId }).lean(),
    TimeSlot.find({ schoolId, academicYearId }).sort({ order: 1 }).lean(),
  ]);
  return {
    settings: settings || {
      workingDays: ["MON", "TUE", "WED", "THU", "FRI"],
    },
    slots,
    entries,
  };
};

const getTeacherTimetable = async (req, res) => {
  try {
    const { schoolId, academicYearId, teacherId, publishedOnly } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !teacherId) {
      return res.status(400).json({
        success: false,
        message: "academicYearId and teacherId are required.",
      });
    }

    const filter = {
      schoolId,
      academicYearId,
      "entries.teacherId": teacherId,
    };
    if (publishedOnly !== false) {
      filter.status = "PUBLISHED";
    }

    const timetables = await Timetable.find(filter)
      .populate("classId", "className section")
      .populate("entries.subjectId", "subjectName subjectCode")
      .populate("entries.roomId", "name code type")
      .populate("entries.timeSlotId", "name order startTime endTime type")
      .lean();

    const entries = [];
    for (const tt of timetables) {
      for (const entry of tt.entries || []) {
        if (String(entry.teacherId) !== String(teacherId)) continue;
        entries.push({
          ...entry,
          classId: tt.classId,
          timetableStatus: tt.status,
        });
      }
    }

    const grid = await buildGridPayload(schoolId, academicYearId, entries);
    const teacher = await Teacher.findById(teacherId)
      .select("firstName lastName staffId")
      .lean();

    return res.status(200).json({
      success: true,
      data: { ...grid, teacher },
    });
  } catch (error) {
    return serverError(res, error, "getTeacherTimetable");
  }
};

const getRoomTimetable = async (req, res) => {
  try {
    const { schoolId, academicYearId, roomId, publishedOnly } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!academicYearId || !roomId) {
      return res.status(400).json({
        success: false,
        message: "academicYearId and roomId are required.",
      });
    }

    const filter = {
      schoolId,
      academicYearId,
      "entries.roomId": roomId,
    };
    if (publishedOnly !== false) {
      filter.status = "PUBLISHED";
    }

    const timetables = await Timetable.find(filter)
      .populate("classId", "className section")
      .populate("entries.subjectId", "subjectName subjectCode")
      .populate("entries.teacherId", "firstName lastName staffId")
      .populate("entries.timeSlotId", "name order startTime endTime type")
      .lean();

    const entries = [];
    for (const tt of timetables) {
      for (const entry of tt.entries || []) {
        if (String(entry.roomId) !== String(roomId)) continue;
        entries.push({
          ...entry,
          classId: tt.classId,
          timetableStatus: tt.status,
        });
      }
    }

    const grid = await buildGridPayload(schoolId, academicYearId, entries);
    const room = await Room.findById(roomId).lean();

    return res.status(200).json({
      success: true,
      data: { ...grid, room },
    });
  } catch (error) {
    return serverError(res, error, "getRoomTimetable");
  }
};

const getMyTimetable = async (req, res) => {
  try {
    const { schoolId, userId, role, academicYearId, childId } = req.body;
    if (!requireSchoolId(schoolId, res)) return;
    if (!userId || !role) {
      return res.status(400).json({
        success: false,
        message: "userId and role are required.",
      });
    }

    let yearId = academicYearId;
    if (!yearId) {
      const current = await AcademicYear.findOne({
        schoolId,
        isCurrent: true,
      }).lean();
      yearId = current?._id;
    }
    if (!yearId) {
      return res.status(200).json({
        success: true,
        data: { entries: [], slots: [], settings: null, context: null },
      });
    }

    if (role === "TEACHER") {
      req.body.academicYearId = yearId;
      req.body.teacherId = userId;
      req.body.publishedOnly = true;
      return getTeacherTimetable(req, res);
    }

    let classId = null;
    let context = null;

    if (role === "STUDENT") {
      const student = await Student.findOne({ _id: userId, schoolId })
        .populate("grade", "className section")
        .lean();
      classId = student?.grade?._id || student?.grade || null;
      context = { type: "STUDENT", class: student?.grade || null };
    } else if (role === "PARENT") {
      const parent = await Parent.findOne({ _id: userId, schoolId }).lean();
      const targetChildId =
        childId || (parent?.children?.length ? parent.children[0] : null);
      if (targetChildId) {
        const student = await Student.findOne({
          _id: targetChildId,
          schoolId,
        })
          .populate("grade", "className section")
          .select("firstName lastName grade")
          .lean();
        classId = student?.grade?._id || student?.grade || null;
        context = {
          type: "PARENT",
          child: student,
          class: student?.grade || null,
        };
      }
    }

    if (!classId) {
      return res.status(200).json({
        success: true,
        data: {
          entries: [],
          slots: [],
          settings: null,
          context,
          message: "No class linked to this account.",
        },
      });
    }

    const tt = await populateTimetable(
      Timetable.findOne({
        schoolId,
        academicYearId: yearId,
        classId,
        status: "PUBLISHED",
      })
    );

    const grid = await buildGridPayload(
      schoolId,
      yearId,
      tt?.entries || []
    );

    return res.status(200).json({
      success: true,
      data: {
        ...grid,
        timetable: tt,
        context,
      },
    });
  } catch (error) {
    return serverError(res, error, "getMyTimetable");
  }
};

module.exports = {
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
};
