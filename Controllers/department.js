const mongoose = require("mongoose");
const Department = require("../models/Departments.model");
const Teacher = require("../models/Teacher");
const School = require("../models/School");

const createDepartment = async (req, res) => {
    try {
        const {
            schoolId,
            departmentName,
            departmentCode,
            departmentHead,
            description,
            email,
            phone,
            phoneCode,
            roomNumber,
            branch,
            parentDepartment,
            isParentDept,
            color,
            displayOrder,
            status,
            createdBy,
        } = req.body;

        if (!schoolId || !departmentName || !createdBy) {
            return res.status(400).json({
                success: false,
                message:
                    "schoolId, departmentName, departmentCode and createdBy are required.",
            });
        }

        const objectIds = [
            { value: schoolId, field: "schoolId" },
            { value: createdBy, field: "createdBy" },
        ];

        if (departmentHead)
            objectIds.push({ value: departmentHead, field: "departmentHead" });

        if (parentDepartment)
            objectIds.push({
                value: parentDepartment,
                field: "parentDepartment",
            });

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

        if (departmentHead) {
            queries.push(
                Teacher.findById(departmentHead).select("_id").lean()
            );
        }

        if (parentDepartment) {
            queries.push(
                Department.findById(parentDepartment).select("_id").lean()
            );
        }

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

        let index = 2;

        if (departmentHead) {
            const teacher = results[index++];

            if (!teacher) {
                return res.status(404).json({
                    success: false,
                    message: "Department head not found.",
                });
            }
        }

        if (parentDepartment) {
            const parentDept = results[index];

            if (!parentDept) {
                return res.status(404).json({
                    success: false,
                    message: "Parent department not found.",
                });
            }
        }

        const department = await Department.create({
            schoolId,
            departmentName: departmentName.trim(),
            departmentCode: departmentCode.trim().toUpperCase(),
            departmentHead: departmentHead || null,
            description: description?.trim() || "",
            email: email?.trim().toLowerCase() || "",
            phone: phone?.trim() || "",
            phoneCode: String(phoneCode || "91").replace(/\D/g, "") || "91",
            roomNumber: roomNumber?.trim() || "",
            branch: branch?.trim() || "",
            parentDepartment: parentDepartment || null,
            isParentDept: isParentDept ?? false,
            color: color || "#4F46E5",
            displayOrder: displayOrder || 0,
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
        const deptName = (department.departmentName || "").trim().toLowerCase();

        const alreadyAssigned = teachers.filter((teacher) => {
            const byId = existingIds.has(String(teacher._id));
            const byName =
                (teacher.department || "").trim().toLowerCase() === deptName;
            return byId || byName;
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

        // Add to department.teacherids only — do not change Teacher.department
        // so the staff member remains in their existing department as well.
        const updated = await Department.findByIdAndUpdate(
            departmentId,
            {
                $addToSet: {
                    teacherids: { $each: teacherIds },
                },
            },
            { new: true }
        )
            .select("departmentName teacherids")
            .lean();

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
                "departmentName departmentCode departmentHead description email phone phoneCode roomNumber branch color displayOrder status teacherids"
            )
            .sort({ displayOrder: 1, departmentName: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: `${filterStatus === "ACTIVE" ? "Active" : "Inactive"} departments fetched successfully.`,
            totalDepartments,
            counts,
            status: filterStatus,
            data: departments,
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
        console.log(departmentQuery,"departmentQuery")

        if (schoolId) {
            departmentQuery.schoolId = schoolId;
        }

        const department = await Department.findOne(departmentQuery)
            .select(
                "_id departmentName departmentCode color status description email phone phoneCode departmentHead schoolId"
            )
            .populate({
                path: "departmentHead",
                select: "firstName lastName email phone phoneCode employeeId",
            })
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
    teachersToDepartment,
    getActiveDepartmentsBySchool,
    getTeachersByDepartment,
};