const mongoose = require("mongoose");
const Event = require("../models/Event.model");
const EventProgram = require("../models/EventProgram.model");
const ProgramRegistration = require("../models/ProgramRegistration.model");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const Class = require("../models/Classes.model");

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value);

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const createEvent = async (req, res) => {
  try {
    const {
      schoolId,
      eventName,
      description,
      bannerUrl,
      eventDate,
      eventTime,
      venue,
      registrationStartDate,
      registrationEndDate,
      status,
      createdBy,
    } = req.body;

    if (
      !schoolId ||
      !eventName ||
      !eventDate ||
      !registrationStartDate ||
      !registrationEndDate ||
      !createdBy
    ) {
      return res.status(400).json({
        success: false,
        message:
          "schoolId, eventName, eventDate, registrationStartDate, registrationEndDate and createdBy are required.",
      });
    }

    if (!isValidId(schoolId) || !isValidId(createdBy)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schoolId or createdBy.",
      });
    }

    const parsedEventDate = parseDate(eventDate);
    const parsedRegStart = parseDate(registrationStartDate);
    const parsedRegEnd = parseDate(registrationEndDate);

    if (!parsedEventDate || !parsedRegStart || !parsedRegEnd) {
      return res.status(400).json({
        success: false,
        message: "Invalid date values provided.",
      });
    }

    if (parsedRegEnd < parsedRegStart) {
      return res.status(400).json({
        success: false,
        message: "Registration end date must be on or after start date.",
      });
    }

    const eventStatus = status || "DRAFT";
    if (!["DRAFT", "PUBLISHED", "CANCELLED"].includes(eventStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event status.",
      });
    }

    const event = await Event.create({
      schoolId,
      eventName: eventName.trim(),
      description: description?.trim() || "",
      bannerUrl: bannerUrl?.trim() || "",
      eventDate: parsedEventDate,
      eventTime: eventTime?.trim() || "",
      venue: venue?.trim() || "",
      registrationStartDate: parsedRegStart,
      registrationEndDate: parsedRegEnd,
      status: eventStatus,
      createdBy,
    });

    return res.status(201).json({
      success: true,
      message: "Event created successfully.",
      data: event,
    });
  } catch (error) {
    console.error("createEvent error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const updateEvent = async (req, res) => {
  try {
    const {
      schoolId,
      eventId,
      eventName,
      description,
      bannerUrl,
      eventDate,
      eventTime,
      venue,
      registrationStartDate,
      registrationEndDate,
      updatedBy,
    } = req.body;

    if (!schoolId || !eventId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and eventId are required.",
      });
    }

    if (!isValidId(schoolId) || !isValidId(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schoolId or eventId.",
      });
    }

    const event = await Event.findOne({ _id: eventId, schoolId });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    if (event.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Cancelled events cannot be edited.",
      });
    }

    if (eventName !== undefined) event.eventName = eventName.trim();
    if (description !== undefined) event.description = description.trim();
    if (bannerUrl !== undefined) event.bannerUrl = bannerUrl.trim();
    if (eventTime !== undefined) event.eventTime = eventTime.trim();
    if (venue !== undefined) event.venue = venue.trim();

    if (eventDate !== undefined) {
      const parsed = parseDate(eventDate);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          message: "Invalid eventDate.",
        });
      }
      event.eventDate = parsed;
    }

    if (registrationStartDate !== undefined) {
      const parsed = parseDate(registrationStartDate);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          message: "Invalid registrationStartDate.",
        });
      }
      event.registrationStartDate = parsed;
    }

    if (registrationEndDate !== undefined) {
      const parsed = parseDate(registrationEndDate);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          message: "Invalid registrationEndDate.",
        });
      }
      event.registrationEndDate = parsed;
    }

    if (event.registrationEndDate < event.registrationStartDate) {
      return res.status(400).json({
        success: false,
        message: "Registration end date must be on or after start date.",
      });
    }

    if (updatedBy && isValidId(updatedBy)) {
      event.updatedBy = updatedBy;
    }

    await event.save();

    return res.status(200).json({
      success: true,
      message: "Event updated successfully.",
      data: event,
    });
  } catch (error) {
    console.error("updateEvent error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

const publishEvent = async (req, res) => {
  try {
    const { schoolId, eventId, updatedBy } = req.body;

    if (!schoolId || !eventId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and eventId are required.",
      });
    }

    const event = await Event.findOne({ _id: eventId, schoolId });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    if (event.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Cancelled events cannot be published.",
      });
    }

    const programCount = await EventProgram.countDocuments({
      schoolId,
      eventId,
    });

    if (programCount === 0) {
      return res.status(400).json({
        success: false,
        message: "Add at least one program before publishing the event.",
      });
    }

    event.status = "PUBLISHED";
    if (updatedBy && isValidId(updatedBy)) event.updatedBy = updatedBy;
    await event.save();

    return res.status(200).json({
      success: true,
      message: "Event published successfully.",
      data: event,
    });
  } catch (error) {
    console.error("publishEvent error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const cancelEvent = async (req, res) => {
  try {
    const { schoolId, eventId, updatedBy } = req.body;

    if (!schoolId || !eventId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and eventId are required.",
      });
    }

    const event = await Event.findOne({ _id: eventId, schoolId });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    event.status = "CANCELLED";
    if (updatedBy && isValidId(updatedBy)) event.updatedBy = updatedBy;
    await event.save();

    await EventProgram.updateMany(
      { schoolId, eventId },
      { $set: { registrationStatus: "CLOSED" } }
    );

    return res.status(200).json({
      success: true,
      message: "Event cancelled successfully.",
      data: event,
    });
  } catch (error) {
    console.error("cancelEvent error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const { schoolId, eventId } = req.body;

    if (!schoolId || !eventId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and eventId are required.",
      });
    }

    const event = await Event.findOne({ _id: eventId, schoolId });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    if (event.status !== "DRAFT") {
      return res.status(400).json({
        success: false,
        message: "Only unpublished (draft) events can be deleted.",
      });
    }

    await EventProgram.deleteMany({ schoolId, eventId });
    await ProgramRegistration.deleteMany({ schoolId, eventId });
    await Event.deleteOne({ _id: eventId, schoolId });

    return res.status(200).json({
      success: true,
      message: "Event deleted successfully.",
    });
  } catch (error) {
    console.error("deleteEvent error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const getEventsBySchool = async (req, res) => {
  try {
    const { schoolId, status, role, studentId, parentId } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "schoolId is required.",
      });
    }

    if (!isValidId(schoolId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid schoolId.",
      });
    }

    const filter = { schoolId };
    const viewerRole = String(role || "").toUpperCase();

    // Students and parents only see published events
    if (["STUDENT", "PARENT"].includes(viewerRole)) {
      filter.status = "PUBLISHED";
    } else if (status && ["DRAFT", "PUBLISHED", "CANCELLED"].includes(status)) {
      filter.status = status;
    }

    const [events, countsAgg] = await Promise.all([
      Event.find(filter).sort({ eventDate: 1, createdAt: -1 }).lean(),
      Event.aggregate([
        { $match: { schoolId: new mongoose.Types.ObjectId(schoolId) } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const counts = { DRAFT: 0, PUBLISHED: 0, CANCELLED: 0, ALL: 0 };
    countsAgg.forEach((row) => {
      counts[row._id] = row.count;
      counts.ALL += row.count;
    });

    const eventIds = events.map((e) => e._id);
    const [programCounts, registrationCounts] = await Promise.all([
      EventProgram.aggregate([
        {
          $match: {
            schoolId: new mongoose.Types.ObjectId(schoolId),
            eventId: { $in: eventIds },
          },
        },
        { $group: { _id: "$eventId", count: { $sum: 1 } } },
      ]),
      ProgramRegistration.aggregate([
        {
          $match: {
            schoolId: new mongoose.Types.ObjectId(schoolId),
            eventId: { $in: eventIds },
            status: "REGISTERED",
          },
        },
        { $group: { _id: "$eventId", count: { $sum: 1 } } },
      ]),
    ]);

    const programMap = Object.fromEntries(
      programCounts.map((r) => [String(r._id), r.count])
    );
    const regMap = Object.fromEntries(
      registrationCounts.map((r) => [String(r._id), r.count])
    );

    let studentRegistrationMap = {};
    let resolvedStudentId = studentId;

    if (viewerRole === "PARENT" && parentId && isValidId(parentId)) {
      const parent = await Parent.findById(parentId).select("children").lean();
      resolvedStudentId = parent?.children?.[0] || null;
    }

    if (resolvedStudentId && isValidId(resolvedStudentId)) {
      const myRegs = await ProgramRegistration.find({
        schoolId,
        studentId: resolvedStudentId,
        eventId: { $in: eventIds },
        status: "REGISTERED",
      })
        .select("eventId")
        .lean();

      studentRegistrationMap = myRegs.reduce((acc, row) => {
        const key = String(row.eventId);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
    }

    const data = events.map((event) => ({
      ...event,
      programCount: programMap[String(event._id)] || 0,
      registrationCount: regMap[String(event._id)] || 0,
      myRegistrationCount: studentRegistrationMap[String(event._id)] || 0,
    }));

    return res.status(200).json({
      success: true,
      totalEvents: data.length,
      counts,
      status: filter.status || "ALL",
      data,
    });
  } catch (error) {
    console.error("getEventsBySchool error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const getEventById = async (req, res) => {
  try {
    const { schoolId, eventId, role, studentId, parentId } = req.body;

    if (!schoolId || !eventId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and eventId are required.",
      });
    }

    const event = await Event.findOne({ _id: eventId, schoolId }).lean();
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    const viewerRole = String(role || "").toUpperCase();
    if (
      ["STUDENT", "PARENT"].includes(viewerRole) &&
      event.status !== "PUBLISHED"
    ) {
      return res.status(403).json({
        success: false,
        message: "This event is not available.",
      });
    }

    const programs = await EventProgram.find({ schoolId, eventId })
      .populate("eligibleClasses", "className section")
      .sort({ programDate: 1, programName: 1 })
      .lean();

    const programIds = programs.map((p) => p._id);
    const regCounts = await ProgramRegistration.aggregate([
      {
        $match: {
          schoolId: new mongoose.Types.ObjectId(schoolId),
          programId: { $in: programIds },
          status: "REGISTERED",
        },
      },
      { $group: { _id: "$programId", count: { $sum: 1 } } },
    ]);
    const regMap = Object.fromEntries(
      regCounts.map((r) => [String(r._id), r.count])
    );

    let myProgramIds = new Set();
    let resolvedStudentId = studentId;
    let student = null;

    if (viewerRole === "PARENT" && parentId && isValidId(parentId)) {
      const parent = await Parent.findById(parentId).select("children").lean();
      resolvedStudentId = parent?.children?.[0] || null;
    }

    if (resolvedStudentId && isValidId(resolvedStudentId)) {
      student = await Student.findById(resolvedStudentId)
        .select("firstName lastName admissionNumber grade section")
        .lean();

      const myRegs = await ProgramRegistration.find({
        schoolId,
        studentId: resolvedStudentId,
        programId: { $in: programIds },
        status: "REGISTERED",
      })
        .select("programId")
        .lean();

      myProgramIds = new Set(myRegs.map((r) => String(r.programId)));
    }

    const now = new Date();
    const programsWithMeta = programs.map((program) => {
      const registeredCount = regMap[String(program._id)] || 0;
      const isRegistered = myProgramIds.has(String(program._id));
      const deadlinePassed = program.registrationDeadline < now;
      const eventRegClosed =
        event.registrationEndDate < now || event.registrationStartDate > now;
      const atCapacity =
        program.maxParticipants != null &&
        registeredCount >= program.maxParticipants;

      let eligible = true;
      if (
        student?.grade &&
        Array.isArray(program.eligibleClasses) &&
        program.eligibleClasses.length > 0
      ) {
        eligible = program.eligibleClasses.some(
          (c) => String(c._id || c) === String(student.grade)
        );
      }

      return {
        ...program,
        registeredCount,
        isRegistered,
        canRegister:
          viewerRole === "STUDENT" &&
          event.status === "PUBLISHED" &&
          program.registrationStatus === "OPEN" &&
          !deadlinePassed &&
          !eventRegClosed &&
          !atCapacity &&
          eligible &&
          !isRegistered,
        canCancel:
          viewerRole === "STUDENT" &&
          isRegistered &&
          program.registrationStatus === "OPEN" &&
          !deadlinePassed,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        event,
        programs: programsWithMeta,
        student,
      },
    });
  } catch (error) {
    console.error("getEventById error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const addProgram = async (req, res) => {
  try {
    const {
      schoolId,
      eventId,
      programName,
      description,
      programDate,
      programTime,
      venue,
      maxParticipants,
      eligibleClasses,
      registrationDeadline,
      registrationStatus,
      createdBy,
    } = req.body;

    if (
      !schoolId ||
      !eventId ||
      !programName ||
      !programDate ||
      !registrationDeadline ||
      !createdBy
    ) {
      return res.status(400).json({
        success: false,
        message:
          "schoolId, eventId, programName, programDate, registrationDeadline and createdBy are required.",
      });
    }

    const event = await Event.findOne({ _id: eventId, schoolId });
    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    if (event.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Cannot add programs to a cancelled event.",
      });
    }

    const parsedProgramDate = parseDate(programDate);
    const parsedDeadline = parseDate(registrationDeadline);
    if (!parsedProgramDate || !parsedDeadline) {
      return res.status(400).json({
        success: false,
        message: "Invalid programDate or registrationDeadline.",
      });
    }

    let classIds = [];
    if (Array.isArray(eligibleClasses) && eligibleClasses.length > 0) {
      classIds = eligibleClasses.filter(isValidId);
      if (classIds.length) {
        const found = await Class.countDocuments({
          schoolId,
          _id: { $in: classIds },
        });
        if (found !== classIds.length) {
          return res.status(400).json({
            success: false,
            message: "One or more eligible classes are invalid.",
          });
        }
      }
    }

    const program = await EventProgram.create({
      schoolId,
      eventId,
      programName: programName.trim(),
      description: description?.trim() || "",
      programDate: parsedProgramDate,
      programTime: programTime?.trim() || "",
      venue: venue?.trim() || "",
      maxParticipants:
        maxParticipants === "" || maxParticipants == null
          ? null
          : Number(maxParticipants),
      eligibleClasses: classIds,
      registrationDeadline: parsedDeadline,
      registrationStatus: registrationStatus === "CLOSED" ? "CLOSED" : "OPEN",
      createdBy,
    });

    return res.status(201).json({
      success: true,
      message: "Program added successfully.",
      data: program,
    });
  } catch (error) {
    console.error("addProgram error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const updateProgram = async (req, res) => {
  try {
    const {
      schoolId,
      programId,
      programName,
      description,
      programDate,
      programTime,
      venue,
      maxParticipants,
      eligibleClasses,
      registrationDeadline,
      registrationStatus,
      updatedBy,
    } = req.body;

    if (!schoolId || !programId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and programId are required.",
      });
    }

    const program = await EventProgram.findOne({ _id: programId, schoolId });
    if (!program) {
      return res.status(404).json({
        success: false,
        message: "Program not found.",
      });
    }

    if (programName !== undefined) program.programName = programName.trim();
    if (description !== undefined) program.description = description.trim();
    if (programTime !== undefined) program.programTime = programTime.trim();
    if (venue !== undefined) program.venue = venue.trim();

    if (programDate !== undefined) {
      const parsed = parseDate(programDate);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          message: "Invalid programDate.",
        });
      }
      program.programDate = parsed;
    }

    if (registrationDeadline !== undefined) {
      const parsed = parseDate(registrationDeadline);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          message: "Invalid registrationDeadline.",
        });
      }
      program.registrationDeadline = parsed;
    }

    if (maxParticipants !== undefined) {
      program.maxParticipants =
        maxParticipants === "" || maxParticipants == null
          ? null
          : Number(maxParticipants);
    }

    if (eligibleClasses !== undefined) {
      const classIds = Array.isArray(eligibleClasses)
        ? eligibleClasses.filter(isValidId)
        : [];
      program.eligibleClasses = classIds;
    }

    if (registrationStatus !== undefined) {
      if (!["OPEN", "CLOSED"].includes(registrationStatus)) {
        return res.status(400).json({
          success: false,
          message: "Invalid registrationStatus.",
        });
      }
      program.registrationStatus = registrationStatus;
    }

    if (updatedBy && isValidId(updatedBy)) {
      program.updatedBy = updatedBy;
    }

    await program.save();

    return res.status(200).json({
      success: true,
      message: "Program updated successfully.",
      data: program,
    });
  } catch (error) {
    console.error("updateProgram error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const deleteProgram = async (req, res) => {
  try {
    const { schoolId, programId } = req.body;

    if (!schoolId || !programId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and programId are required.",
      });
    }

    const program = await EventProgram.findOne({ _id: programId, schoolId });
    if (!program) {
      return res.status(404).json({
        success: false,
        message: "Program not found.",
      });
    }

    const event = await Event.findOne({
      _id: program.eventId,
      schoolId,
    }).select("status");

    if (event?.status === "PUBLISHED") {
      const regCount = await ProgramRegistration.countDocuments({
        schoolId,
        programId,
        status: "REGISTERED",
      });
      if (regCount > 0) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot delete a program that already has student registrations.",
        });
      }
    }

    await ProgramRegistration.deleteMany({ schoolId, programId });
    await EventProgram.deleteOne({ _id: programId, schoolId });

    return res.status(200).json({
      success: true,
      message: "Program deleted successfully.",
    });
  } catch (error) {
    console.error("deleteProgram error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const registerForProgram = async (req, res) => {
  try {
    const { schoolId, programId, studentId } = req.body;

    if (!schoolId || !programId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "schoolId, programId and studentId are required.",
      });
    }

    const [program, student] = await Promise.all([
      EventProgram.findOne({ _id: programId, schoolId }),
      Student.findOne({ _id: studentId, schoolId }).select(
        "grade status firstName lastName"
      ),
    ]);

    if (!program) {
      return res.status(404).json({
        success: false,
        message: "Program not found.",
      });
    }

    if (!student || student.status !== "ACTIVE") {
      return res.status(404).json({
        success: false,
        message: "Student not found or inactive.",
      });
    }

    const event = await Event.findOne({
      _id: program.eventId,
      schoolId,
    }).select(
      "status registrationStartDate registrationEndDate eventName"
    );

    if (!event || event.status !== "PUBLISHED") {
      return res.status(400).json({
        success: false,
        message: "Registration is only allowed for published events.",
      });
    }

    const now = new Date();
    if (
      now < event.registrationStartDate ||
      now > event.registrationEndDate
    ) {
      return res.status(400).json({
        success: false,
        message: "Event registration window is closed.",
      });
    }

    if (program.registrationStatus !== "OPEN") {
      return res.status(400).json({
        success: false,
        message: "Program registration is closed.",
      });
    }

    if (now > program.registrationDeadline) {
      return res.status(400).json({
        success: false,
        message: "Program registration deadline has passed.",
      });
    }

    if (
      Array.isArray(program.eligibleClasses) &&
      program.eligibleClasses.length > 0
    ) {
      const eligible = program.eligibleClasses.some(
        (id) => String(id) === String(student.grade)
      );
      if (!eligible) {
        return res.status(403).json({
          success: false,
          message: "You are not eligible for this program.",
        });
      }
    }

    const existing = await ProgramRegistration.findOne({
      programId,
      studentId,
    });

    if (existing && existing.status === "REGISTERED") {
      return res.status(409).json({
        success: false,
        message: "You are already registered for this program.",
      });
    }

    if (program.maxParticipants != null) {
      const count = await ProgramRegistration.countDocuments({
        schoolId,
        programId,
        status: "REGISTERED",
      });
      if (count >= program.maxParticipants) {
        return res.status(400).json({
          success: false,
          message: "Maximum participants reached for this program.",
        });
      }
    }

    let registration;
    if (existing) {
      existing.status = "REGISTERED";
      existing.registeredAt = now;
      existing.cancelledAt = null;
      registration = await existing.save();
    } else {
      registration = await ProgramRegistration.create({
        schoolId,
        eventId: program.eventId,
        programId,
        studentId,
        registeredAt: now,
        status: "REGISTERED",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Registered successfully.",
      data: registration,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "You are already registered for this program.",
      });
    }
    console.error("registerForProgram error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const cancelRegistration = async (req, res) => {
  try {
    const { schoolId, programId, studentId } = req.body;

    if (!schoolId || !programId || !studentId) {
      return res.status(400).json({
        success: false,
        message: "schoolId, programId and studentId are required.",
      });
    }

    const [program, registration] = await Promise.all([
      EventProgram.findOne({ _id: programId, schoolId }),
      ProgramRegistration.findOne({
        schoolId,
        programId,
        studentId,
        status: "REGISTERED",
      }),
    ]);

    if (!program) {
      return res.status(404).json({
        success: false,
        message: "Program not found.",
      });
    }

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: "Registration not found.",
      });
    }

    const now = new Date();
    if (now > program.registrationDeadline) {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel after the registration deadline.",
      });
    }

    registration.status = "CANCELLED";
    registration.cancelledAt = now;
    await registration.save();

    return res.status(200).json({
      success: true,
      message: "Registration cancelled successfully.",
      data: registration,
    });
  } catch (error) {
    console.error("cancelRegistration error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const getParticipants = async (req, res) => {
  try {
    const {
      schoolId,
      eventId,
      programId,
      classId,
      section,
      search,
      parentId,
      role,
    } = req.body;

    if (!schoolId) {
      return res.status(400).json({
        success: false,
        message: "schoolId is required.",
      });
    }

    const viewerRole = String(role || "").toUpperCase();
    const filter = {
      schoolId: new mongoose.Types.ObjectId(schoolId),
      status: "REGISTERED",
    };

    if (eventId && isValidId(eventId)) {
      filter.eventId = new mongoose.Types.ObjectId(eventId);
    }
    if (programId && isValidId(programId)) {
      filter.programId = new mongoose.Types.ObjectId(programId);
    }

    // Parents only see their children's registrations
    if (viewerRole === "PARENT") {
      if (!parentId || !isValidId(parentId)) {
        return res.status(400).json({
          success: false,
          message: "parentId is required for parent access.",
        });
      }
      const parent = await Parent.findById(parentId).select("children").lean();
      const children = parent?.children || [];
      if (!children.length) {
        return res.status(200).json({
          success: true,
          total: 0,
          data: [],
        });
      }
      filter.studentId = { $in: children };
    }

    const pipeline = [
      { $match: filter },
      {
        $lookup: {
          from: "students",
          localField: "studentId",
          foreignField: "_id",
          as: "student",
        },
      },
      { $unwind: "$student" },
      {
        $lookup: {
          from: "classes",
          localField: "student.grade",
          foreignField: "_id",
          as: "classInfo",
        },
      },
      {
        $lookup: {
          from: "events",
          localField: "eventId",
          foreignField: "_id",
          as: "event",
        },
      },
      { $unwind: "$event" },
      {
        $lookup: {
          from: "eventprograms",
          localField: "programId",
          foreignField: "_id",
          as: "program",
        },
      },
      { $unwind: "$program" },
    ];

    const matchExtra = {};
    if (classId && isValidId(classId)) {
      matchExtra["student.grade"] = new mongoose.Types.ObjectId(classId);
    }
    if (section) {
      matchExtra["student.section"] = String(section).trim().toUpperCase();
    }
    if (search) {
      const q = String(search).trim();
      matchExtra.$or = [
        { "student.firstName": { $regex: q, $options: "i" } },
        { "student.lastName": { $regex: q, $options: "i" } },
        { "student.admissionNumber": { $regex: q, $options: "i" } },
        { "program.programName": { $regex: q, $options: "i" } },
        { "event.eventName": { $regex: q, $options: "i" } },
      ];
    }
    if (Object.keys(matchExtra).length) {
      pipeline.push({ $match: matchExtra });
    }

    pipeline.push(
      { $sort: { registeredAt: -1 } },
      {
        $project: {
          _id: 1,
          registeredAt: 1,
          status: 1,
          studentId: 1,
          studentName: {
            $trim: {
              input: {
                $concat: [
                  { $ifNull: ["$student.firstName", ""] },
                  " ",
                  { $ifNull: ["$student.lastName", ""] },
                ],
              },
            },
          },
          admissionNumber: "$student.admissionNumber",
          className: {
            $ifNull: [{ $arrayElemAt: ["$classInfo.className", 0] }, ""],
          },
          section: {
            $ifNull: [
              "$student.section",
              { $arrayElemAt: ["$classInfo.section", 0] },
            ],
          },
          classId: "$student.grade",
          programId: 1,
          programName: "$program.programName",
          eventId: 1,
          eventName: "$event.eventName",
        },
      }
    );

    const data = await ProgramRegistration.aggregate(pipeline);

    return res.status(200).json({
      success: true,
      total: data.length,
      data,
    });
  } catch (error) {
    console.error("getParticipants error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const getEventDashboardStats = async (req, res) => {
  try {
    const { schoolId } = req.body;

    if (!schoolId || !isValidId(schoolId)) {
      return res.status(400).json({
        success: false,
        message: "schoolId is required.",
      });
    }

    const schoolObjectId = new mongoose.Types.ObjectId(schoolId);
    const now = new Date();

    const [
      totalEvents,
      publishedEvents,
      upcomingEvents,
      totalPrograms,
      totalRegistrations,
      eventWise,
      programWise,
    ] = await Promise.all([
      Event.countDocuments({ schoolId }),
      Event.countDocuments({ schoolId, status: "PUBLISHED" }),
      Event.countDocuments({
        schoolId,
        status: "PUBLISHED",
        eventDate: { $gte: now },
      }),
      EventProgram.countDocuments({ schoolId }),
      ProgramRegistration.countDocuments({ schoolId, status: "REGISTERED" }),
      ProgramRegistration.aggregate([
        {
          $match: {
            schoolId: schoolObjectId,
            status: "REGISTERED",
          },
        },
        { $group: { _id: "$eventId", count: { $sum: 1 } } },
        {
          $lookup: {
            from: "events",
            localField: "_id",
            foreignField: "_id",
            as: "event",
          },
        },
        { $unwind: "$event" },
        {
          $project: {
            eventId: "$_id",
            eventName: "$event.eventName",
            count: 1,
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      ProgramRegistration.aggregate([
        {
          $match: {
            schoolId: schoolObjectId,
            status: "REGISTERED",
          },
        },
        { $group: { _id: "$programId", count: { $sum: 1 } } },
        {
          $lookup: {
            from: "eventprograms",
            localField: "_id",
            foreignField: "_id",
            as: "program",
          },
        },
        { $unwind: "$program" },
        {
          $project: {
            programId: "$_id",
            programName: "$program.programName",
            eventId: "$program.eventId",
            count: 1,
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalEvents,
        activeEvents: publishedEvents,
        upcomingEvents,
        totalPrograms,
        totalRegistrations,
        eventWiseRegistrationCount: eventWise,
        programWiseRegistrationCount: programWise,
      },
    });
  } catch (error) {
    console.error("getEventDashboardStats error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = {
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
};
