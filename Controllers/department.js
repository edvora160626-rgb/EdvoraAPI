const mongoose = require("mongoose");
const Department = require("../models/Departments.model");
const Teacher = require("../models/Teacher");
const School = require("../models/School");
const { generateUniqueCode } = require("../utils/generateUniqueCode");

const createDepartment = async (req, res) => {
    try {
        const {
            schoolId,
            departmentName,
            description,
            email,
            phone,
            phoneCode,
            roomNumber,
            branch,
            color,
            status,
            createdBy,
        } = req.body;

        if (!schoolId || !departmentName || !createdBy) {
            return res.status(400).json({
                success: false,
                message:
                    "schoolId, departmentName and createdBy are required.",
            });
        }

        const objectIds = [
            { value: schoolId, field: "schoolId" },
            { value: createdBy, field: "createdBy" },
        ];

        for (const id of objectIds) {
            if (!mongoose.Types.ObjectId.isValid(id.value)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid ${id.field}.`,
                });
            }
        }

        // Parallel Queries
        const queries = [
            School.findById(schoolId).select("_id").lean(),
            Department.findOne({
                schoolId,
                departmentName: {
                    $regex: new RegExp(`^${departmentName.trim()}$`, "i"),
                },
            })
                .select("_id")
                .lean(),
        ];

        const results = await Promise.all(queries);

        const school = results[0];
        const existingDepartment = results[1];

        if (!school) {
            return res.status(404).json({
                success: false,
                message: "School not found.",
            });
        }

        if (existingDepartment) {
            return res.status(409).json({
                success: false,
                message: "Department already exists.",
            });
        }

        const departmentCode = await generateUniqueCode({
            Model: Department,
            schoolId,
            field: "departmentCode",
            name: departmentName,
        });

        const department = await Department.create({
            schoolId,
            departmentName: departmentName.trim(),
            departmentCode,
            description: description?.trim() || "",
            email: email?.trim().toLowerCase() || "",
            phone: phone?.trim() || "",
            phoneCode: String(phoneCode || "91").replace(/\D/g, "") || "91",
            roomNumber: roomNumber?.trim() || "",
            branch: branch?.trim() || "",
            color: color || "#4F46E5",
            status: status || "ACTIVE",
            createdBy,
        });

        return res.status(201).json({
            success: true,
            message: "Department created successfully.",
            data: department,
        });
    } catch (error) {
        console.error("createDepartment Error:", error);

        // Duplicate Key Error
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Department name or code already exists.",
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

function escapeDepartmentName(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const updateDepartment = async (req, res) => {
    try {
        const {
            departmentId,
            schoolId,
            departmentName,
            description,
            email,
            phone,
            phoneCode,
            roomNumber,
            branch,
            color,
            status,
        } = req.body;

        if (!departmentId || !schoolId || !departmentName) {
            return res.status(400).json({
                success: false,
                message: "departmentId, schoolId and departmentName are required.",
            });
        }

        if (
            !mongoose.Types.ObjectId.isValid(departmentId) ||
            !mongoose.Types.ObjectId.isValid(schoolId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid departmentId or schoolId.",
            });
        }

        const nextStatus = status === "INACTIVE" ? "INACTIVE" : "ACTIVE";
        const trimmedName = String(departmentName).trim();

        if (!trimmedName) {
            return res.status(400).json({
                success: false,
                message: "Department name is required.",
            });
        }

        const existing = await Department.findOne({
            _id: departmentId,
            schoolId,
        }).select("_id");

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Department not found.",
            });
        }

        const duplicate = await Department.findOne({
            schoolId,
            _id: { $ne: departmentId },
            departmentName: {
                $regex: new RegExp(`^${escapeDepartmentName(trimmedName)}$`, "i"),
            },
        })
            .select("_id")
            .lean();

        if (duplicate) {
            return res.status(409).json({
                success: false,
                message: "Department already exists.",
            });
        }

        const department = await Department.findOneAndUpdate(
            { _id: departmentId, schoolId },
            {
                $set: {
                    departmentName: trimmedName,
                    description: description?.trim() || "",
                    email: email?.trim().toLowerCase() || "",
                    phone: phone?.trim() || "",
                    phoneCode: String(phoneCode || "91").replace(/\D/g, "") || "91",
                    roomNumber: roomNumber?.trim() || "",
                    branch: branch?.trim() || "",
                    color: color || "#4F46E5",
                    status: nextStatus,
                },
            },
            { new: true, runValidators: true }
        ).lean();

        return res.status(200).json({
            success: true,
            message: "Department updated successfully.",
            data: department,
        });
    } catch (error) {
        console.error("updateDepartment Error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Department name or code already exists.",
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

const teachersToDepartment = async (req, res) => {
    try {
        const departmentId = req.body.departmentId || req.body.departmentid;
        const teacherIdsRaw =
            req.body.teacherIds ||
            req.body.teacherid ||
            (req.body.teacherId ? [req.body.teacherId] : null);

        const teacherIds = Array.isArray(teacherIdsRaw)
            ? teacherIdsRaw
            : teacherIdsRaw
              ? [teacherIdsRaw]
              : [];

        if (!departmentId || teacherIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: "departmentId and teacherId are required.",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid departmentId.",
            });
        }

        for (const id of teacherIds) {
            if (!mongoose.Types.ObjectId.isValid(id)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid teacherId.",
                });
            }
        }

        const department = await Department.findById(departmentId)
            .select("departmentName schoolId teacherids")
            .lean();

        if (!department) {
            return res.status(404).json({
                success: false,
                message: "Department not found.",
            });
        }

        const teachers = await Teacher.find({
            _id: { $in: teacherIds },
            schoolId: department.schoolId,
        })
            .select("_id firstName lastName department status")
            .lean();

        if (teachers.length !== teacherIds.length) {
            return res.status(404).json({
                success: false,
                message: "One or more staff members were not found.",
            });
        }

        const existingIds = new Set(
            (department.teacherids || []).map((id) => String(id))
        );
        const departmentObjectId = new mongoose.Types.ObjectId(departmentId);

        const alreadyAssigned = teachers.filter((teacher) => {
            const byDeptList = existingIds.has(String(teacher._id));
            const teacherDepts = Array.isArray(teacher.department)
                ? teacher.department
                : teacher.department
                  ? [teacher.department]
                  : [];
            const byTeacherDept = teacherDepts.some(
                (id) => String(id) === String(departmentId)
            );
            return byDeptList || byTeacherDept;
        });

        if (alreadyAssigned.length > 0) {
            const names = alreadyAssigned
                .map((t) =>
                    [t.firstName, t.lastName].filter(Boolean).join(" ").trim()
                )
                .filter(Boolean)
                .join(", ");

            return res.status(409).json({
                success: false,
                message: names
                    ? `${names} is already assigned to this department.`
                    : "Staff member is already assigned to this department.",
            });
        }

        // Keep Department.teacherids and Teacher.department in sync so staff
        // appear in getTeachersByDepartment while retaining other departments.
        const [updated] = await Promise.all([
            Department.findByIdAndUpdate(
                departmentId,
                {
                    $addToSet: {
                        teacherids: { $each: teacherIds },
                    },
                },
                { new: true }
            )
                .select("departmentName teacherids")
                .lean(),
            Teacher.updateMany(
                { _id: { $in: teacherIds } },
                { $addToSet: { department: departmentObjectId } }
            ),
        ]);

        return res.status(200).json({
            success: true,
            message: "Staff assigned to department successfully.",
            data: updated,
        });
    } catch (error) {
        console.error("teachersToDepartment Error:", error);

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

const totalActiveTeachers = async (req, res) => {
    try {
        const { schoolId } = req.body;

        if (!schoolId) {
            return res.status(400).json({
                success: false,
                message: "schoolId is required.",
            });
        }

        const teachers = await Teacher.find({
            schoolId,
            role: "TEACHER",
            status: "ACTIVE",
        })
        .select("-password -__v") // Select only required fields
        .lean();                  // Returns plain JS objects (faster)

        return res.status(200).json({
            success: true,
            message: "Active teachers fetched successfully.",
            totalTeachers: teachers.length,
            data: teachers,
        });

    } catch (error) {
        console.error("totalActiveTeachers Error:", error);

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

const getActiveDepartmentsBySchool = async (req, res) => {
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

        const [activeCount, inactiveCount] = await Promise.all([
            Department.countDocuments({ schoolId, status: "ACTIVE" }),
            Department.countDocuments({ schoolId, status: "INACTIVE" }),
        ]);

        const counts = {
            ACTIVE: activeCount,
            INACTIVE: inactiveCount,
        };
        const totalDepartments = activeCount + inactiveCount;

        if (flag === "COUNT") {
            return res.status(200).json({
                success: true,
                totalDepartments,
                counts,
                departmentsCount: activeCount,
            });
        }

        const departments = await Department.find({
            schoolId,
            status: filterStatus,
        })
            .select(
                "departmentName departmentCode description email phone phoneCode roomNumber branch color status teacherids"
            )
            .sort({ departmentName: 1 })
            .lean();

        // Count ACTIVE teachers by Teacher.department (same source as staff page)
        const schoolObjectId = new mongoose.Types.ObjectId(schoolId);
        const staffCountRows = await Teacher.aggregate([
            {
                $match: {
                    schoolId: schoolObjectId,
                    status: "ACTIVE",
                    department: { $exists: true, $ne: [] },
                },
            },
            { $unwind: "$department" },
            {
                $group: {
                    _id: "$department",
                    count: { $sum: 1 },
                },
            },
        ]);

        const countByDept = new Map(
            staffCountRows.map((row) => [String(row._id), row.count])
        );

        const data = departments.map((dept) => ({
            ...dept,
            staffCount: countByDept.get(String(dept._id)) || 0,
        }));

        return res.status(200).json({
            success: true,
            message: `${filterStatus === "ACTIVE" ? "Active" : "Inactive"} departments fetched successfully.`,
            totalDepartments,
            counts,
            status: filterStatus,
            data,
        });
    } catch (error) {
        console.error("getActiveDepartmentsBySchool Error:", error);

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

const getTeachersByDepartment = async (req, res) => {
    try {
        const { departmentId, schoolId } = req.body;

        if (!departmentId) {
            return res.status(400).json({
                success: false,
                message: "departmentId is required.",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid departmentId.",
            });
        }

        if (schoolId && !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid schoolId.",
            });
        }

        const departmentQuery = {
            _id: departmentId,
        };

        if (schoolId) {
            departmentQuery.schoolId = schoolId;
        }

        const department = await Department.findOne(departmentQuery)
            .select(
                "_id departmentName departmentCode color status description email phone phoneCode schoolId"
            )
            .lean();

        if (!department) {
            return res.status(404).json({
                success: false,
                message: "Department not found.",
            });
        }

        const teachers = await Teacher.find({
            schoolId: department.schoolId,
            department: department._id,
            status: "ACTIVE",
        })
            .populate({
                path: "department",
                select: "departmentName departmentCode color",
            })
            .select("-password -__v -forgotOtp -welcomeOTP")
            .sort({
                firstName: 1,
                lastName: 1,
            })
            .lean();

        // Keep Department.teacherids aligned with teachers who list this department
        const teacherIds = teachers.map((t) => t._id);
        if (teacherIds.length > 0) {
            await Department.updateOne(
                { _id: department._id },
                { $addToSet: { teacherids: { $each: teacherIds } } }
            );
        }

        return res.status(200).json({
            success: true,
            message: "Department staff fetched successfully.",
            totalStaff: teachers.length,
            data: {
                department,
                staff: teachers,
            },
        });
    } catch (error) {
        console.error("getTeachersByDepartment Error:", error);

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
    createDepartment,
    updateDepartment,
    teachersToDepartment,
    getActiveDepartmentsBySchool,
    getTeachersByDepartment,
};