const mongoose = require("mongoose");
const Attendance = require("../models/Attendance.model");
const { ATTENDANCE_STATUSES } = require("../models/Attendance.model");
const AttendanceLog = require("../models/AttendanceLog.model");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const ClassesModel = require("../models/Classes.model");
const { findUserAcrossModels } = require("../utils/roleModelMap");

function startOfDay(dateInput) {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        return new Date(Date.UTC(year, month, day));
    }
    return startOfDay(dateStr);
}

function summarizeRecords(records = []) {
    const summary = {
        total: records.length,
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
        HALF_DAY: 0,
        LEAVE: 0,
    };

    for (const record of records) {
        if (summary[record.status] != null) {
            summary[record.status] += 1;
        }
    }

    return summary;
}

function normalizeStatus(status) {
    if (!status) return null;
    const value = String(status).trim().toUpperCase().replace(/[\s-]+/g, "_");
    const aliases = {
        P: "PRESENT",
        A: "ABSENT",
        L: "LATE",
        HD: "HALF_DAY",
        HALFDAY: "HALF_DAY",
        HALF: "HALF_DAY",
        LV: "LEAVE",
        ON_LEAVE: "LEAVE",
    };
    const resolved = aliases[value] || value;
    return ATTENDANCE_STATUSES.includes(resolved) ? resolved : null;
}

async function resolveActor(markedBy) {
    if (!markedBy || !mongoose.Types.ObjectId.isValid(markedBy)) {
        return { name: "Unknown", role: "" };
    }

    try {
        const found = await findUserAcrossModels({ _id: markedBy });
        if (!found?.user) return { name: "Unknown", role: "" };
        const user = found.user;
        const name =
            [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
            user.email ||
            "Unknown";
        return { name, role: user.role || "" };
    } catch {
        return { name: "Unknown", role: "" };
    }
}

async function resolveClassLabel(classId) {
    if (!classId || !mongoose.Types.ObjectId.isValid(classId)) return "";
    const classInfo = await ClassesModel.findById(classId)
        .select("className section")
        .lean();
    if (!classInfo) return "";
    return `${classInfo.className} · Sec ${classInfo.section}`;
}

const ADMIN_ROLES = new Set([
    "SCHOOL_ADMIN",
    "SUPER_ADMIN",
    "PRODUCT_ADMIN",
]);

/**
 * Student attendance is scoped to the assigned class teacher
 * (Classes.classTeacherId). School/product admins can access any class.
 */
async function assertStudentClassAccess({ schoolId, classId, actorId }) {
    if (!classId || !mongoose.Types.ObjectId.isValid(classId)) {
        return { ok: false, status: 400, message: "Valid classId is required." };
    }

    const classDoc = await ClassesModel.findOne({ _id: classId, schoolId })
        .select("className section classTeacherId status")
        .lean();

    if (!classDoc) {
        return { ok: false, status: 404, message: "Class not found." };
    }

    if (!actorId || !mongoose.Types.ObjectId.isValid(actorId)) {
        return {
            ok: false,
            status: 400,
            message: "teacherId / markedBy is required for student attendance.",
        };
    }

    if (
        classDoc.classTeacherId &&
        String(classDoc.classTeacherId) === String(actorId)
    ) {
        return { ok: true, classDoc };
    }

    const found = await findUserAcrossModels({ _id: actorId });
    const role = found?.user?.role || "";
    if (ADMIN_ROLES.has(role)) {
        return { ok: true, classDoc };
    }

    return {
        ok: false,
        status: 403,
        message:
            "Only the assigned class teacher can view or mark attendance for this class.",
    };
}

async function writeAttendanceLog({
    schoolId,
    type,
    action,
    attendanceDate,
    classId = null,
    attendanceId = null,
    markedBy,
    records = [],
    notes = "",
    source = "MANUAL",
}) {
    try {
        const [actor, classLabel] = await Promise.all([
            resolveActor(markedBy),
            type === "STUDENT" ? resolveClassLabel(classId) : Promise.resolve(""),
        ]);

        await AttendanceLog.create({
            schoolId,
            type,
            action,
            attendanceDate,
            classId: type === "STUDENT" ? classId : null,
            classLabel,
            attendanceId,
            markedBy,
            markedByName: actor.name,
            markedByRole: actor.role,
            recordCount: records.length,
            summary: summarizeRecords(records),
            notes: notes || "",
            source,
        });
    } catch (error) {
        console.error("writeAttendanceLog Error:", error);
    }
}

const getTeachersForAttendance = async (req, res) => {
    try {
        const { schoolId, date } = req.body;

        if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Valid schoolId is required.",
            });
        }

        const attendanceDate = parseLocalDate(date) || parseLocalDate(new Date());

        const [teachers, existing] = await Promise.all([
            Teacher.find({ schoolId, status: "ACTIVE" })
                .select("firstName lastName email employeeId staffId department")
                .populate("department", "departmentName")
                .sort({ firstName: 1, lastName: 1 })
                .lean(),
            Attendance.findOne({
                schoolId,
                type: "TEACHER",
                date: attendanceDate,
                classId: null,
            })
                .select("records.status records.personId records.remarks")
                .lean(),
        ]);

        const statusMap = new Map(
            (existing?.records || []).map((r) => [String(r.personId), r])
        );

        const data = teachers.map((teacher) => {
            const marked = statusMap.get(String(teacher._id));
            const departments = Array.isArray(teacher.department)
                ? teacher.department
                : teacher.department
                  ? [teacher.department]
                  : [];
            const departmentName = departments
                .map((dept) => dept?.departmentName)
                .filter(Boolean)
                .join(" / ");

            return {
                _id: teacher._id,
                firstName: teacher.firstName,
                lastName: teacher.lastName,
                email: teacher.email,
                employeeId: teacher.employeeId,
                staffId: teacher.staffId,
                department: departmentName,
                attendanceStatus: marked?.status || null,
                remarks: marked?.remarks || "",
            };
        });

        return res.status(200).json({
            success: true,
            message: "Teachers fetched for attendance.",
            date: attendanceDate,
            totalTeachers: data.length,
            isMarked: Boolean(existing),
            summary: summarizeRecords(existing?.records || []),
            data,
        });
    } catch (error) {
        console.error("getTeachersForAttendance Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

const getAssignedClassesForAttendance = async (req, res) => {
    try {
        const { schoolId, teacherId, date } = req.body;

        if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Valid schoolId is required.",
            });
        }

        if (!teacherId || !mongoose.Types.ObjectId.isValid(teacherId)) {
            return res.status(400).json({
                success: false,
                message: "Valid teacherId is required.",
            });
        }

        const attendanceDate = parseLocalDate(date) || parseLocalDate(new Date());
        const found = await findUserAcrossModels({ _id: teacherId });
        const role = found?.user?.role || "";

        const classFilter = {
            schoolId,
            status: "ACTIVE",
        };

        if (!ADMIN_ROLES.has(role)) {
            classFilter.classTeacherId = teacherId;
        }

        const classes = await ClassesModel.find(classFilter)
            .select("_id className section classTeacherId strength status")
            .sort({ className: 1, section: 1 })
            .lean();

        const classIds = classes.map((cls) => cls._id);

        const [studentCounts, attendanceSheets] = await Promise.all([
            classIds.length
                ? Student.aggregate([
                      {
                          $match: {
                              schoolId: new mongoose.Types.ObjectId(schoolId),
                              grade: { $in: classIds },
                              status: "ACTIVE",
                          },
                      },
                      {
                          $group: {
                              _id: "$grade",
                              count: { $sum: 1 },
                          },
                      },
                  ])
                : Promise.resolve([]),
            classIds.length
                ? Attendance.find({
                      schoolId,
                      type: "STUDENT",
                      date: attendanceDate,
                      classId: { $in: classIds },
                  })
                      .select("classId records.status")
                      .lean()
                : Promise.resolve([]),
        ]);

        const strengthByClassId = new Map(
            studentCounts.map((row) => [String(row._id), row.count])
        );
        const sheetByClassId = new Map(
            attendanceSheets.map((sheet) => [String(sheet.classId), sheet])
        );

        const data = classes.map((cls) => {
            const sheet = sheetByClassId.get(String(cls._id));
            const summary = summarizeRecords(sheet?.records || []);
            const totalStudents = strengthByClassId.get(String(cls._id)) || 0;
            return {
                _id: cls._id,
                className: cls.className,
                section: cls.section,
                classTeacherId: cls.classTeacherId || null,
                status: cls.status,
                totalStudents,
                isMarked: Boolean(sheet),
                markedCount: sheet?.records?.length || 0,
                summary,
            };
        });

        return res.status(200).json({
            success: true,
            message: "Assigned classes fetched for student attendance.",
            date: attendanceDate,
            totalClasses: data.length,
            data,
        });
    } catch (error) {
        console.error("getAssignedClassesForAttendance Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

const getStudentsForAttendance = async (req, res) => {
    try {
        const { schoolId, classId, date, teacherId } = req.body;

        if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Valid schoolId is required.",
            });
        }

        const access = await assertStudentClassAccess({
            schoolId,
            classId,
            actorId: teacherId,
        });
        if (!access.ok) {
            return res.status(access.status).json({
                success: false,
                message: access.message,
            });
        }

        const classInfo = access.classDoc;
        const attendanceDate = parseLocalDate(date) || parseLocalDate(new Date());

        const [students, existing] = await Promise.all([
            Student.find({ schoolId, grade: classId, status: "ACTIVE" })
                .select("firstName lastName admissionNumber rollNumber email")
                .sort({ firstName: 1, lastName: 1 })
                .lean(),
            Attendance.findOne({
                schoolId,
                type: "STUDENT",
                date: attendanceDate,
                classId,
            })
                .select("records.status records.personId records.remarks")
                .lean(),
        ]);

        const statusMap = new Map(
            (existing?.records || []).map((r) => [String(r.personId), r])
        );

        const data = students.map((student) => {
            const marked = statusMap.get(String(student._id));
            return {
                _id: student._id,
                firstName: student.firstName,
                lastName: student.lastName,
                admissionNumber: student.admissionNumber,
                rollNumber: student.rollNumber,
                email: student.email || "",
                attendanceStatus: marked?.status || null,
                remarks: marked?.remarks || "",
            };
        });

        return res.status(200).json({
            success: true,
            message: "Students fetched for attendance.",
            date: attendanceDate,
            totalStudents: data.length,
            isMarked: Boolean(existing),
            summary: summarizeRecords(existing?.records || []),
            data: {
                class: {
                    _id: classInfo._id,
                    className: classInfo.className,
                    section: classInfo.section,
                    status: classInfo.status,
                    classTeacherId: classInfo.classTeacherId || null,
                },
                students: data,
            },
        });
    } catch (error) {
        console.error("getStudentsForAttendance Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

const markAttendance = async (req, res) => {
    try {
        const { schoolId, type, date, classId, records, markedBy, notes } =
            req.body;

        if (!schoolId || !type || !date || !markedBy) {
            return res.status(400).json({
                success: false,
                message: "schoolId, type, date and markedBy are required.",
            });
        }

        if (!["TEACHER", "STUDENT"].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "type must be TEACHER or STUDENT.",
            });
        }

        if (type === "STUDENT" && !classId) {
            return res.status(400).json({
                success: false,
                message: "classId is required for student attendance.",
            });
        }

        if (!Array.isArray(records) || records.length === 0) {
            return res.status(400).json({
                success: false,
                message: "At least one attendance record is required.",
            });
        }

        const ids = [
            { value: schoolId, field: "schoolId" },
            { value: markedBy, field: "markedBy" },
        ];
        if (classId) ids.push({ value: classId, field: "classId" });

        for (const id of ids) {
            if (!mongoose.Types.ObjectId.isValid(id.value)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid ${id.field}.`,
                });
            }
        }

        if (type === "STUDENT") {
            const access = await assertStudentClassAccess({
                schoolId,
                classId,
                actorId: markedBy,
            });
            if (!access.ok) {
                return res.status(access.status).json({
                    success: false,
                    message: access.message,
                });
            }
        }

        const attendanceDate = parseLocalDate(date);
        if (!attendanceDate) {
            return res.status(400).json({
                success: false,
                message: "Invalid date. Use YYYY-MM-DD format.",
            });
        }

        const cleanedRecords = [];
        for (const item of records) {
            if (!item?.personId || !mongoose.Types.ObjectId.isValid(item.personId)) {
                return res.status(400).json({
                    success: false,
                    message: "Each record needs a valid personId.",
                });
            }

            const status = normalizeStatus(item.status);
            if (!status) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid status for person ${item.personId}. Allowed: ${ATTENDANCE_STATUSES.join(", ")}`,
                });
            }

            cleanedRecords.push({
                personId: item.personId,
                status,
                remarks: item.remarks ? String(item.remarks).trim() : "",
            });
        }

        const filter = {
            schoolId,
            type,
            date: attendanceDate,
            classId: type === "STUDENT" ? classId : null,
        };

        const existed = await Attendance.exists(filter);

        const attendance = await Attendance.findOneAndUpdate(
            filter,
            {
                $set: {
                    records: cleanedRecords,
                    markedBy,
                    notes: notes ? String(notes).trim() : "",
                },
                $setOnInsert: filter,
            },
            {
                upsert: true,
                new: true,
                lean: true,
                projection: { records: 1, date: 1, type: 1, classId: 1 },
            }
        );

        const summary = summarizeRecords(attendance?.records || []);

        await writeAttendanceLog({
            schoolId,
            type,
            action: existed ? "UPDATED" : "MARKED",
            attendanceDate,
            classId: type === "STUDENT" ? classId : null,
            attendanceId: attendance?._id || null,
            markedBy,
            records: attendance?.records || [],
            notes: notes ? String(notes).trim() : "",
            source: "MANUAL",
        });

        return res.status(200).json({
            success: true,
            message: "Attendance saved successfully.",
            data: {
                _id: attendance?._id,
                date: attendance?.date,
                type: attendance?.type,
                classId: attendance?.classId || null,
            },
            summary,
        });
    } catch (error) {
        console.error("markAttendance Error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Attendance already exists for this date.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

const bulkUploadAttendance = async (req, res) => {
    try {
        const { schoolId, type, date, classId, rows, markedBy, notes } = req.body;

        if (!schoolId || !type || !date || !markedBy) {
            return res.status(400).json({
                success: false,
                message: "schoolId, type, date and markedBy are required.",
            });
        }

        if (!["TEACHER", "STUDENT"].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "type must be TEACHER or STUDENT.",
            });
        }

        if (type === "STUDENT" && !classId) {
            return res.status(400).json({
                success: false,
                message: "classId is required for student bulk upload.",
            });
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Upload rows are required.",
            });
        }

        if (
            !mongoose.Types.ObjectId.isValid(schoolId) ||
            !mongoose.Types.ObjectId.isValid(markedBy)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid schoolId or markedBy.",
            });
        }

        if (type === "STUDENT") {
            if (!mongoose.Types.ObjectId.isValid(classId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid classId.",
                });
            }
            const access = await assertStudentClassAccess({
                schoolId,
                classId,
                actorId: markedBy,
            });
            if (!access.ok) {
                return res.status(access.status).json({
                    success: false,
                    message: access.message,
                });
            }
        }

        const attendanceDate = parseLocalDate(date);
        if (!attendanceDate) {
            return res.status(400).json({
                success: false,
                message: "Invalid date. Use YYYY-MM-DD format.",
            });
        }

        let people = [];
        if (type === "TEACHER") {
            people = await Teacher.find({ schoolId, status: "ACTIVE" })
                .select("_id email employeeId staffId")
                .lean();
        } else {
            people = await Student.find({
                schoolId,
                grade: classId,
                status: "ACTIVE",
            })
                .select("_id email admissionNumber rollNumber")
                .lean();
        }

        const byEmail = new Map();
        const byEmployeeId = new Map();
        const byStaffId = new Map();
        const byAdmission = new Map();
        const byRoll = new Map();

        for (const person of people) {
            if (person.email) byEmail.set(String(person.email).toLowerCase(), person);
            if (person.employeeId)
                byEmployeeId.set(String(person.employeeId).toLowerCase(), person);
            if (person.staffId)
                byStaffId.set(String(person.staffId).toLowerCase(), person);
            if (person.admissionNumber)
                byAdmission.set(
                    String(person.admissionNumber).toLowerCase(),
                    person
                );
            if (person.rollNumber)
                byRoll.set(String(person.rollNumber).toLowerCase(), person);
        }

        const validRecords = [];
        const errors = [];
        const seen = new Set();

        rows.forEach((row, index) => {
            const line = index + 1;
            const identifier = String(
                row.identifier ||
                    row.employeeId ||
                    row.admissionNumber ||
                    row.rollNumber ||
                    row.email ||
                    row.id ||
                    ""
            )
                .trim()
                .toLowerCase();

            const status = normalizeStatus(row.status);

            if (!identifier) {
                errors.push({ line, message: "Missing identifier." });
                return;
            }

            if (!status) {
                errors.push({
                    line,
                    message: `Invalid status "${row.status || ""}".`,
                });
                return;
            }

            let person = null;
            if (type === "TEACHER") {
                person =
                    byEmployeeId.get(identifier) ||
                    byStaffId.get(identifier) ||
                    byEmail.get(identifier);
            } else {
                person =
                    byAdmission.get(identifier) ||
                    byRoll.get(identifier) ||
                    byEmail.get(identifier);
            }

            if (!person) {
                errors.push({
                    line,
                    message: `No match found for "${identifier}".`,
                });
                return;
            }

            const personKey = String(person._id);
            if (seen.has(personKey)) {
                errors.push({
                    line,
                    message: `Duplicate entry for "${identifier}".`,
                });
                return;
            }
            seen.add(personKey);

            validRecords.push({
                personId: person._id,
                status,
                remarks: row.remarks ? String(row.remarks).trim() : "",
            });
        });

        if (validRecords.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid attendance rows to save.",
                errors,
                summary: { valid: 0, invalid: errors.length },
            });
        }

        const filter = {
            schoolId,
            type,
            date: attendanceDate,
            classId: type === "STUDENT" ? classId : null,
        };

        const existing = await Attendance.findOne(filter)
            .select("records notes")
            .lean();
        const mergedMap = new Map(
            (existing?.records || []).map((r) => [String(r.personId), r])
        );

        for (const record of validRecords) {
            mergedMap.set(String(record.personId), record);
        }

        const mergedRecords = Array.from(mergedMap.values());

        const attendance = await Attendance.findOneAndUpdate(
            filter,
            {
                $set: {
                    records: mergedRecords,
                    markedBy,
                    notes: notes
                        ? String(notes).trim()
                        : existing?.notes || "Bulk upload",
                },
                $setOnInsert: filter,
            },
            {
                upsert: true,
                new: true,
                lean: true,
                projection: { records: 1 },
            }
        );

        const summary = summarizeRecords(attendance?.records || []);

        await writeAttendanceLog({
            schoolId,
            type,
            action: "BULK_UPLOAD",
            attendanceDate,
            classId: type === "STUDENT" ? classId : null,
            attendanceId: attendance?._id || null,
            markedBy,
            records: attendance?.records || [],
            notes: notes
                ? String(notes).trim()
                : existing?.notes || "Bulk upload",
            source: "BULK",
        });

        return res.status(200).json({
            success: true,
            message: "Bulk attendance uploaded successfully.",
            summary: {
                valid: validRecords.length,
                invalid: errors.length,
                ...summary,
            },
            errors,
        });
    } catch (error) {
        console.error("bulkUploadAttendance Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

const getAttendanceSummary = async (req, res) => {
    try {
        const { schoolId, type, date, classId } = req.body;

        if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Valid schoolId is required.",
            });
        }

        const attendanceType = ["TEACHER", "STUDENT"].includes(type)
            ? type
            : "TEACHER";
        const attendanceDate = parseLocalDate(date) || parseLocalDate(new Date());

        const filter = {
            schoolId,
            type: attendanceType,
            date: attendanceDate,
        };

        if (attendanceType === "STUDENT" && classId) {
            filter.classId = classId;
        } else if (attendanceType === "TEACHER") {
            filter.classId = null;
        }

        const peopleQuery =
            attendanceType === "TEACHER"
                ? Teacher.countDocuments({ schoolId, status: "ACTIVE" })
                : classId
                  ? Student.countDocuments({
                        schoolId,
                        grade: classId,
                        status: "ACTIVE",
                    })
                  : Promise.resolve(0);

        const [totalPeople, existing] = await Promise.all([
            peopleQuery,
            Attendance.findOne(filter).select("records.status").lean(),
        ]);

        const summary = summarizeRecords(existing?.records || []);

        return res.status(200).json({
            success: true,
            message: "Attendance summary fetched.",
            date: attendanceDate,
            type: attendanceType,
            isMarked: Boolean(existing),
            totalPeople,
            markedCount: existing?.records?.length || 0,
            summary,
        });
    } catch (error) {
        console.error("getAttendanceSummary Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

const getAttendanceLogs = async (req, res) => {
    try {
        const {
            schoolId,
            type,
            classId,
            page = 1,
            limit = 20,
            fromDate,
            toDate,
        } = req.body;

        if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Valid schoolId is required.",
            });
        }

        const attendanceType = ["TEACHER", "STUDENT"].includes(type)
            ? type
            : null;

        const filter = { schoolId };
        if (attendanceType) filter.type = attendanceType;
        if (classId && mongoose.Types.ObjectId.isValid(classId)) {
            filter.classId = classId;
        }

        const from = parseLocalDate(fromDate);
        const to = parseLocalDate(toDate);
        if (from || to) {
            filter.attendanceDate = {};
            if (from) filter.attendanceDate.$gte = from;
            if (to) filter.attendanceDate.$lte = to;
        }

        const pageNum = Math.max(1, Number(page) || 1);
        const pageSize = Math.min(50, Math.max(1, Number(limit) || 20));
        const skip = (pageNum - 1) * pageSize;

        const [totalLogs, logs] = await Promise.all([
            AttendanceLog.countDocuments(filter),
            AttendanceLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean(),
        ]);

        return res.status(200).json({
            success: true,
            message: "Attendance logs fetched.",
            totalLogs,
            page: pageNum,
            limit: pageSize,
            data: logs,
        });
    } catch (error) {
        console.error("getAttendanceLogs Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

const getAttendanceLogDetail = async (req, res) => {
    try {
        const { schoolId, logId } = req.body;

        if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Valid schoolId is required.",
            });
        }

        if (!logId || !mongoose.Types.ObjectId.isValid(logId)) {
            return res.status(400).json({
                success: false,
                message: "Valid logId is required.",
            });
        }

        const log = await AttendanceLog.findOne({ _id: logId, schoolId }).lean();
        if (!log) {
            return res.status(404).json({
                success: false,
                message: "Attendance log not found.",
            });
        }

        let people = [];
        let attendance = null;

        if (log.attendanceId) {
            attendance = await Attendance.findById(log.attendanceId)
                .select("records date type classId")
                .lean();
        }

        if (!attendance) {
            attendance = await Attendance.findOne({
                schoolId,
                type: log.type,
                date: log.attendanceDate,
                classId: log.type === "STUDENT" ? log.classId : null,
            })
                .select("records date type classId")
                .lean();
        }

        if (attendance?.records?.length) {
            const personIds = attendance.records.map((r) => r.personId);
            if (log.type === "TEACHER") {
                people = await Teacher.find({ _id: { $in: personIds } })
                    .select("firstName lastName employeeId staffId email")
                    .lean();
            } else {
                people = await Student.find({ _id: { $in: personIds } })
                    .select("firstName lastName admissionNumber rollNumber")
                    .lean();
            }

            const peopleMap = new Map(
                people.map((p) => [String(p._id), p])
            );

            people = attendance.records.map((record) => {
                const person = peopleMap.get(String(record.personId));
                return {
                    personId: record.personId,
                    status: record.status,
                    remarks: record.remarks || "",
                    firstName: person?.firstName || "",
                    lastName: person?.lastName || "",
                    employeeId: person?.employeeId || person?.staffId || "",
                    admissionNumber: person?.admissionNumber || "",
                    rollNumber: person?.rollNumber || "",
                    email: person?.email || "",
                };
            });
        }

        return res.status(200).json({
            success: true,
            message: "Attendance log detail fetched.",
            data: {
                log,
                records: people,
            },
        });
    } catch (error) {
        console.error("getAttendanceLogDetail Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

module.exports = {
    getAssignedClassesForAttendance,
    getTeachersForAttendance,
    getStudentsForAttendance,
    markAttendance,
    bulkUploadAttendance,
    getAttendanceSummary,
    getAttendanceLogs,
    getAttendanceLogDetail,
};
