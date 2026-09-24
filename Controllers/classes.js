const mongoose = require("mongoose");
const ClassesModel = require("../models/Classes.model");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Timetable = require("../models/Timetable.model");
const Subject = require("../models/Subjects.model");
const SubjectAllocation = require("../models/SubjectAllocation.model");
const Attendance = require("../models/Attendance.model");
const AttendanceLog = require("../models/AttendanceLog.model");
const EventProgram = require("../models/EventProgram.model");
const {
    ensureTeachersHaveStaffIds,
} = require("../utils/generateStaffId");

/** Letters, numbers, and single spaces between words only. */
const VALID_CLASS_FIELD = /^[a-zA-Z0-9]+(?:\s+[a-zA-Z0-9]+)*$/;

function assertAlphanumericField(value, fieldLabel, res) {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
        res.status(400).json({
            success: false,
            message: `${fieldLabel} is required.`,
        });
        return null;
    }
    if (!VALID_CLASS_FIELD.test(trimmed)) {
        res.status(400).json({
            success: false,
            message: `${fieldLabel} may only contain letters and numbers (no special characters).`,
        });
        return null;
    }
    return trimmed;
}

async function getClassRelatedUsage(classId) {
    const id = new mongoose.Types.ObjectId(classId);

    const [
        students,
        attendance,
        attendanceLogs,
        timetables,
        subjects,
        subjectAllocations,
        eventPrograms,
    ] = await Promise.all([
        Student.countDocuments({ grade: id }),
        Attendance.countDocuments({ classId: id }),
        AttendanceLog.countDocuments({ classId: id }),
        Timetable.countDocuments({ classId: id }),
        Subject.countDocuments({ classId: id }),
        SubjectAllocation.countDocuments({ classId: id }),
        EventProgram.countDocuments({ eligibleClasses: id }),
    ]);

    const usage = {
        students,
        attendance,
        attendanceLogs,
        timetables,
        subjects,
        subjectAllocations,
        eventPrograms,
    };

    const blockers = Object.entries(usage)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => ({ module: key, count }));

    return {
        usage,
        blockers,
        hasRelatedData: blockers.length > 0,
    };
}

function formatRelatedBlockMessage(action, blockers) {
    const labels = {
        students: "students",
        attendance: "attendance records",
        attendanceLogs: "attendance logs",
        timetables: "timetable entries",
        subjects: "subjects",
        subjectAllocations: "subject allocations",
        eventPrograms: "event programs",
    };

    const parts = blockers.map(
        ({ module, count }) => `${count} ${labels[module] || module}`
    );

    return `Cannot ${action} this class because related data exists (${parts.join(", ")}).`;
}

const addClasses = async (req, res) => {
    try {
        const {
            schoolId,
            className,
            section,
            classTeacherId,
            createdBy,
        } = req.body;

        if (!schoolId || !className || !section) {
            return res.status(400).json({
                success: false,
                message: "schoolId, className and section are required.",
            });
        }

        const safeName = assertAlphanumericField(className, "Class name", res);
        if (safeName === null) return;
        const safeSection = assertAlphanumericField(section, "Section", res);
        if (safeSection === null) return;

        const existingClass = await ClassesModel.findOne({
            schoolId,
            className: safeName,
            section: safeSection.toUpperCase(),
        }).lean();

        if (existingClass) {
            return res.status(409).json({
                success: false,
                message: "Class already exists.",
            });
        }

        const newClass = await ClassesModel.create({
            schoolId,
            className: safeName,
            section: safeSection.toUpperCase(),
            classTeacherId: classTeacherId || null,
            createdBy,
            updatedBy: createdBy,
        });

        return res.status(201).json({
            success: true,
            message: "Class created successfully.",
            data: newClass,
        });
    } catch (error) {
        console.error("addClasses Error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Class already exists.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : "Something went wrong",
        });
    }
};

const updateClass = async (req, res) => {
    try {
        const { classId, schoolId, className, section, updatedBy } = req.body;

        if (!classId || !className || !section) {
            return res.status(400).json({
                success: false,
                message: "classId, className and section are required.",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(classId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid classId.",
            });
        }

        if (schoolId && !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid schoolId.",
            });
        }

        const classQuery = { _id: classId };
        if (schoolId) classQuery.schoolId = schoolId;

        const classDoc = await ClassesModel.findOne(classQuery).lean();
        if (!classDoc) {
            return res.status(404).json({
                success: false,
                message: "Class not found.",
            });
        }

        const nextName = assertAlphanumericField(className, "Class name", res);
        if (nextName === null) return;
        const nextSectionRaw = assertAlphanumericField(section, "Section", res);
        if (nextSectionRaw === null) return;
        const nextSection = nextSectionRaw.toUpperCase();

        const duplicate = await ClassesModel.findOne({
            schoolId: classDoc.schoolId,
            className: nextName,
            section: nextSection,
            _id: { $ne: classDoc._id },
        }).lean();

        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: "Another class with this name and section already exists.",
            });
        }

        const updated = await ClassesModel.findByIdAndUpdate(
            classDoc._id,
            {
                className: nextName,
                section: nextSection,
                ...(updatedBy ? { updatedBy } : {}),
            },
            { new: true }
        )
            .select("_id className section classTeacherId strength status")
            .lean();

        return res.status(200).json({
            success: true,
            message: "Class updated successfully.",
            data: updated,
        });
    } catch (error) {
        console.error("updateClass Error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Another class with this name and section already exists.",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : "Something went wrong",
        });
    }
};

const updateClassStatus = async (req, res) => {
    try {
        const { classId, schoolId, status, updatedBy } = req.body;
        const nextStatus = String(status || "").toUpperCase();

        if (!classId || !["ACTIVE", "INACTIVE"].includes(nextStatus)) {
            return res.status(400).json({
                success: false,
                message: "classId and a valid status (ACTIVE or INACTIVE) are required.",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(classId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid classId.",
            });
        }

        if (schoolId && !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid schoolId.",
            });
        }

        const classQuery = { _id: classId };
        if (schoolId) classQuery.schoolId = schoolId;

        const classDoc = await ClassesModel.findOne(classQuery).lean();
        if (!classDoc) {
            return res.status(404).json({
                success: false,
                message: "Class not found.",
            });
        }

        if (classDoc.status === nextStatus) {
            return res.status(200).json({
                success: true,
                message: `Class is already ${nextStatus.toLowerCase()}.`,
                data: classDoc,
            });
        }

        if (nextStatus === "INACTIVE") {
            const related = await getClassRelatedUsage(classDoc._id);
            if (related.hasRelatedData) {
                return res.status(409).json({
                    success: false,
                    message: formatRelatedBlockMessage("deactivate", related.blockers),
                    data: related.usage,
                });
            }
        }

        const updated = await ClassesModel.findByIdAndUpdate(
            classDoc._id,
            {
                status: nextStatus,
                ...(updatedBy ? { updatedBy } : {}),
            },
            { new: true }
        )
            .select("_id className section classTeacherId strength status")
            .lean();

        return res.status(200).json({
            success: true,
            message:
                nextStatus === "INACTIVE"
                    ? "Class marked as inactive."
                    : "Class marked as active.",
            data: updated,
        });
    } catch (error) {
        console.error("updateClassStatus Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : "Something went wrong",
        });
    }
};

const deleteClass = async (req, res) => {
    try {
        const { classId, schoolId } = req.body;

        if (!classId) {
            return res.status(400).json({
                success: false,
                message: "classId is required.",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(classId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid classId.",
            });
        }

        if (schoolId && !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid schoolId.",
            });
        }

        const classQuery = { _id: classId };
        if (schoolId) classQuery.schoolId = schoolId;

        const classDoc = await ClassesModel.findOne(classQuery).lean();
        if (!classDoc) {
            return res.status(404).json({
                success: false,
                message: "Class not found.",
            });
        }

        const related = await getClassRelatedUsage(classDoc._id);
        if (related.hasRelatedData) {
            return res.status(409).json({
                success: false,
                message: formatRelatedBlockMessage("delete", related.blockers),
                data: related.usage,
            });
        }

        await ClassesModel.findByIdAndDelete(classDoc._id);

        return res.status(200).json({
            success: true,
            message: "Class deleted successfully.",
            data: { _id: classDoc._id },
        });
    } catch (error) {
        console.error("deleteClass Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : "Something went wrong",
        });
    }
};

const getActiveClassesBySchool = async (req, res) => {
    try {
        const { schoolId, flag, status, classTeacherId } = req.body;
        const allowedStatuses = ["ACTIVE", "INACTIVE"];
        const filterStatus = allowedStatuses.includes(status) ? status : "ACTIVE";

        if (!schoolId) {
            return res.status(400).json({
                success: false,
                message: "schoolId is required.",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid schoolId.",
            });
        }

        if (
            classTeacherId &&
            !mongoose.Types.ObjectId.isValid(classTeacherId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid classTeacherId.",
            });
        }

        const schoolObjectId = new mongoose.Types.ObjectId(schoolId);

        const [activeCount, inactiveCount] = await Promise.all([
            ClassesModel.countDocuments({ schoolId: schoolObjectId, status: "ACTIVE" }),
            ClassesModel.countDocuments({ schoolId: schoolObjectId, status: "INACTIVE" }),
        ]);

        const counts = {
            ACTIVE: activeCount,
            INACTIVE: inactiveCount,
        };
        const totalClasses = activeCount + inactiveCount;

        if (flag === "COUNT") {
            return res.status(200).json({
                success: true,
                totalClasses,
                counts,
                classesCount: activeCount,
            });
        }

        const classQuery = {
            schoolId: schoolObjectId,
            status: filterStatus,
        };
        if (classTeacherId) {
            classQuery.classTeacherId = classTeacherId;
        }

        const classes = await ClassesModel.find(classQuery)
            .select("_id className section classTeacherId strength status")
            .sort({ className: 1, section: 1 })
            .lean();

        const classIds = classes.map((cls) => cls._id);
        let strengthByClassId = new Map();

        if (classIds.length > 0) {
            const studentCounts = await Student.aggregate([
                {
                    $match: {
                        schoolId: schoolObjectId,
                        grade: { $in: classIds },
                        status: { $in: ["ACTIVE", "REQUESTED"] },
                    },
                },
                {
                    $group: {
                        _id: "$grade",
                        count: { $sum: 1 },
                    },
                },
            ]);

            strengthByClassId = new Map(
                studentCounts.map((row) => [String(row._id), row.count])
            );
        }

        const data = classes.map((cls) => ({
            ...cls,
            strength: strengthByClassId.get(String(cls._id)) || 0,
        }));

        return res.status(200).json({
            success: true,
            message: `${filterStatus === "ACTIVE" ? "Active" : "Inactive"} classes fetched successfully.`,
            totalClasses,
            counts,
            status: filterStatus,
            data,
        });
    } catch (error) {
        console.error("getActiveClassesBySchool Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : "Something went wrong",
        });
    }
};

const getStudentsByClass = async (req, res) => {
    try {
        const { classId, schoolId } = req.body;

        if (!classId) {
            return res.status(400).json({
                success: false,
                message: "classId is required.",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(classId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid classId.",
            });
        }

        if (schoolId && !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid schoolId.",
            });
        }

        const classQuery = { _id: classId };
        if (schoolId) classQuery.schoolId = schoolId;

        const classDoc = await ClassesModel.findOne(classQuery)
            .select("_id className section status schoolId strength classTeacherId")
            .lean();

        if (!classDoc) {
            return res.status(404).json({
                success: false,
                message: "Class not found.",
            });
        }

        const studentQuery = {
            grade: classDoc._id,
            schoolId: classDoc.schoolId,
            status: { $in: ["ACTIVE", "REQUESTED", "INACTIVE"] },
        };

        const [students, classTeacher] = await Promise.all([
            Student.find(studentQuery)
                .select("-password -__v -forgotOtp -welcomeOTP")
                .sort({ firstName: 1, lastName: 1 })
                .lean(),
            classDoc.classTeacherId
                ? Teacher.findById(classDoc.classTeacherId)
                      .select("firstName lastName staffId employeeId")
                      .lean()
                : Promise.resolve(null),
        ]);

        return res.status(200).json({
            success: true,
            message: "Class students fetched successfully.",
            totalStudents: students.length,
            data: {
                class: {
                    _id: classDoc._id,
                    className: classDoc.className,
                    section: classDoc.section,
                    status: classDoc.status,
                    classTeacherId: classDoc.classTeacherId || null,
                    classTeacher: classTeacher || null,
                },
                students,
            },
        });
    } catch (error) {
        console.error("getStudentsByClass Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : "Something went wrong",
        });
    }
};

const getActiveStaffBySchool = async (req, res) => {
    try {
        const { schoolId } = req.body;

        if (!schoolId) {
            return res.status(400).json({
                success: false,
                message: "schoolId is required.",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid schoolId.",
            });
        }

        const staff = await Teacher.find({
            schoolId,
            role: "TEACHER",
            status: "ACTIVE",
        })
            .select("firstName lastName staffId employeeId email")
            .sort({ firstName: 1, lastName: 1 })
            .lean();

        const staffWithIds = await ensureTeachersHaveStaffIds(schoolId, staff);

        return res.status(200).json({
            success: true,
            message: "Active staff fetched successfully.",
            totalStaff: staffWithIds.length,
            data: staffWithIds,
        });
    } catch (error) {
        console.error("getActiveStaffBySchool Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : "Something went wrong",
        });
    }
};

const assignStaffToClass = async (req, res) => {
    try {
        const { classId, teacherId, schoolId, updatedBy } = req.body;

        if (!classId || !teacherId) {
            return res.status(400).json({
                success: false,
                message: "classId and teacherId are required.",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(classId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid classId.",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(teacherId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid teacherId.",
            });
        }

        if (schoolId && !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid schoolId.",
            });
        }

        const classQuery = { _id: classId };
        if (schoolId) classQuery.schoolId = schoolId;

        const classDoc = await ClassesModel.findOne(classQuery)
            .select("_id schoolId className section classTeacherId")
            .lean();

        if (!classDoc) {
            return res.status(404).json({
                success: false,
                message: "Class not found.",
            });
        }

        const teacher = await Teacher.findOne({
            _id: teacherId,
            schoolId: classDoc.schoolId,
            role: "TEACHER",
            status: "ACTIVE",
        })
            .select("firstName lastName staffId employeeId")
            .lean();

        if (!teacher) {
            return res.status(404).json({
                success: false,
                message: "Active staff member not found for this school.",
            });
        }

        const updatedClass = await ClassesModel.findByIdAndUpdate(
            classDoc._id,
            {
                classTeacherId: teacher._id,
                ...(updatedBy ? { updatedBy } : {}),
            },
            { new: true }
        )
            .select("_id className section classTeacherId status")
            .lean();

        return res.status(200).json({
            success: true,
            message: "Staff assigned to class successfully.",
            data: {
                class: updatedClass,
                classTeacher: teacher,
            },
        });
    } catch (error) {
        console.error("assignStaffToClass Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : "Something went wrong",
        });
    }
};

module.exports = {
    addClasses,
    updateClass,
    updateClassStatus,
    deleteClass,
    getActiveClassesBySchool,
    getStudentsByClass,
    getActiveStaffBySchool,
    assignStaffToClass,
};
