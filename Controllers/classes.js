const mongoose = require("mongoose");
const ClassesModel = require("../models/Classes.model");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const {
    ensureTeachersHaveStaffIds,
} = require("../utils/generateStaffId");

const addClasses = async (req, res) => {
    try {
        const {
            schoolId,
            className,
            section,
            classTeacherId,
            createdBy,
        } = req.body;

        // Validate required fields
        if (!schoolId || !className || !section) {
            return res.status(400).json({
                success: false,
                message: "schoolId, className and section are required.",
            });
        }

        // Check if class already exists
        const existingClass = await ClassesModel.findOne({
            schoolId,
            className: className.trim(),
            section: section.trim().toUpperCase(),
        }).lean();

        if (existingClass) {
            return res.status(409).json({
                success: false,
                message: "Class already exists.",
            });
        }

        // Create class
        const newClass = await ClassesModel.create({
            schoolId,
            className: className.trim(),
            section: section.trim().toUpperCase(),
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

        // Handle duplicate index error
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

const getActiveClassesBySchool = async (req, res) => {
    try {
        const { schoolId, flag, status } = req.body;
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

        const classes = await ClassesModel.find({
            schoolId: schoolObjectId,
            status: filterStatus,
        })
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
    getActiveClassesBySchool,
    getStudentsByClass,
    getActiveStaffBySchool,
    assignStaffToClass,
};
