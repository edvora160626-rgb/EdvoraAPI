const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const School = require("../models/School");
const Student = require("../models/Student");
const Department = require("../models/Departments.model");
const generateToken = require("../utils/generateJwt");
const { getModelByRole, findUserAcrossModels, roleModelMap } = require("../utils/roleModelMap");
const { generateStaffEmployeeId } = require("../utils/generateStaffId");

const normalizePhoneCode = (value) =>
    String(value ?? "").replace(/\D/g, "") || "91";

const toDepartmentId = (value) => {
    if (!value) return "";
    if (typeof value === "object") {
        // Already populated department doc
        if (value.departmentName) return "";
        const fromProps = value._id || value.id;
        if (fromProps) return String(fromProps).trim();
        // Bare ObjectId from lean()/unpopulated ref
        if (typeof value.toString === "function") {
            const asString = String(value.toString());
            if (/^[a-f\d]{24}$/i.test(asString)) return asString;
        }
        return "";
    }
    return String(value).trim();
};

const formatDepartmentLabel = (dept) => {
    if (!dept || typeof dept !== "object" || !dept.departmentName) return "";
    return dept.departmentCode
        ? `${dept.departmentName} (${dept.departmentCode})`
        : dept.departmentName;
};

const resolveTeacherDepartmentLabels = async (users = []) => {
    const idSet = new Set();

    for (const user of users) {
        const departments = Array.isArray(user.department)
            ? user.department
            : user.department
              ? [user.department]
              : [];

        for (const dept of departments) {
            if (dept && typeof dept === "object" && dept.departmentName) continue;
            const id = toDepartmentId(dept);
            if (id && mongoose.Types.ObjectId.isValid(id)) idSet.add(id);
        }
    }

    const nameById = new Map();
    if (idSet.size) {
        const docs = await Department.find({
            _id: { $in: Array.from(idSet) },
        })
            .select("departmentName departmentCode")
            .lean();

        for (const doc of docs) {
            nameById.set(String(doc._id), formatDepartmentLabel(doc));
        }
    }

    return users.map((user) => {
        const departments = Array.isArray(user.department)
            ? user.department
            : user.department
              ? [user.department]
              : [];

        const department = departments
            .map((dept) => {
                if (dept && typeof dept === "object" && dept.departmentName) {
                    return formatDepartmentLabel(dept);
                }
                return nameById.get(toDepartmentId(dept)) || "";
            })
            .filter(Boolean)
            .join(", ");

        return {
            ...user,
            department,
        };
    });
};

const generateSchoolCode = () => {
    return (
        "SCH" +
        Math.random().toString(36).substring(2, 8).toUpperCase()
    );
};

const resolveParentChildren = async (childrenInput, schoolId) => {
    if (!Array.isArray(childrenInput) || childrenInput.length === 0) {
        return { error: "Relationship and Children are required." };
    }

    if (!schoolId) {
        return { error: "School is required to link children." };
    }

    const resolvedIds = [];

    for (const entry of childrenInput) {
        const value = String(entry || "").trim();
        if (!value) continue;

        let student = null;

        if (mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === value) {
            student = await Student.findOne({
                _id: value,
                schoolId,
            }).lean();
        }

        if (!student) {
            student = await Student.findOne({
                admissionNumber: value,
                schoolId,
            }).lean();
        }

        if (!student) {
            return {
                error: `Student not found for "${value}". Use a valid admission number or student ID.`,
            };
        }

        resolvedIds.push(student._id);
    }

    if (resolvedIds.length === 0) {
        return { error: "Relationship and Children are required." };
    }

    return { children: resolvedIds };
};

const register = async (req, res) => {
    try {
        const {
            schoolId,
            role,
            firstName,
            lastName,
            email,
            phonecode,
            phone,
            password,

            // Student
            admissionNumber,
            rollNumber,
            grade,
            section,

            // Teacher
            employeeId,
            department,
            qualification,
            subjects,

            // Parent
            relationship,
            children
        } = req.body;
        const normalizedPhoneCode = normalizePhoneCode(phonecode);

        if (
            !role ||
            !firstName ||
            !lastName ||
            !email ||
            !phone ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                message: "Required fields are missing."
            });
        }
        console.log("HERE1")

        const allowedRoles = [
            "SUPER_ADMIN",
            "SCHOOL_ADMIN",
            "TEACHER",
            "STUDENT",
            "PARENT"
        ];

        if (!allowedRoles.includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid role."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters."
            });
        }

        switch (role) {
            case "STUDENT":
                if (!admissionNumber || !grade || !rollNumber || !section) {
                    return res.status(400).json({
                        success: false,
                        message: "Admission Number, Roll Number, Grade and Section are required."
                    });
                }
                if (!mongoose.Types.ObjectId.isValid(grade)) {
                    return res.status(400).json({
                        success: false,
                        message: "Grade must be a valid Class ID."
                    });
                }
                break;

            case "TEACHER":
                if (
                    !Array.isArray(department) ||
                    department.length === 0 ||
                    !qualification
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "At least one Department and Qualification are required.",
                    });
                }

                const invalidDepartment = department.some(
                    (id) => !mongoose.Types.ObjectId.isValid(id)
                );

                if (invalidDepartment) {
                    return res.status(400).json({
                        success: false,
                        message: "One or more Department IDs are invalid."
                    });
                }

                break;

            case "PARENT":
                if (!relationship || !Array.isArray(children) || children.length === 0) {
                    return res.status(400).json({
                        success: false,
                        message: "Relationship and Children are required."
                    });
                }
                break;

            case "SCHOOL_ADMIN":
                break;
            case "SUPER_ADMIN":
                break;
        }

        // Resolve the correct model for this role
        const Model = getModelByRole(role);

        const existingUser = await Model.findOne({
            $or: [
                { email },
                {
                    phone,
                    phoneCode: normalizedPhoneCode
                }
            ]
        }).lean();

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "User already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const userData = {
            schoolId,
            role,
            firstName,
            lastName,
            email,
            phone,
            phoneCode: normalizedPhoneCode,
            password: hashedPassword
        };

        if (role === "STUDENT") {
            Object.assign(userData, {
                admissionNumber,
                rollNumber,
                grade,
                section
            });
        }

        if (role === "TEACHER") {
            let autoStaffId;
            try {
                autoStaffId = await generateStaffEmployeeId(schoolId);
            } catch (genError) {
                return res.status(400).json({
                    success: false,
                    message: genError.message || "Failed to generate staff ID.",
                });
            }

            Object.assign(userData, {
                staffId: autoStaffId,
                employeeId: autoStaffId,
                department: department.map(id => new mongoose.Types.ObjectId(id)),
                qualification,
                subjects,
            });
        }

        if (role === "SCHOOL_ADMIN") {
            try {
                userData.employeeId = await generateStaffEmployeeId(schoolId);
            } catch (genError) {
                return res.status(400).json({
                    success: false,
                    message: genError.message || "Failed to generate employee ID.",
                });
            }
        }

        if (role === "PARENT") {
            const resolved = await resolveParentChildren(children, schoolId);
            if (resolved.error) {
                return res.status(400).json({
                    success: false,
                    message: resolved.error,
                });
            }

            Object.assign(userData, {
                relationship,
                children: resolved.children,
            });
        }

        const user = await Model.create(userData);

        const response = user.toObject();
        delete response.password;

        return res.status(201).json({
            success: true,
            message: `${role} registered successfully.`,
            data: response
        });

    } catch (error) {
        console.error("Register Error:", error);

        if (error?.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0] || "field";
            return res.status(409).json({
                success: false,
                message: `${field} already exists.`,
            });
        }

        if (error?.name === "CastError") {
            const field = error.path || "field";
            return res.status(400).json({
                success: false,
                message:
                    field === "grade"
                        ? "Grade must be a valid Class ID from the selected school."
                        : field === "children"
                            ? "Invalid children value. Use student admission numbers or valid student IDs."
                            : `Invalid value for ${field}.`,
            });
        }

        if (error?.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : undefined
        });
    }
};

const registerSchool = async (req, res) => {
    try {
        const {
            schoolName,
            email,
            phone,
            address,
            city,
            state,
            country,
            pincode,
            website,
            principalName,
        } = req.body;

        const existingSchool = await School.exists({
            $or: [{ email }, { phone }],
        });

        if (existingSchool) {
            return res.status(400).json({
                success: false,
                message: "School already exists",
            });
        }

        let school;
        let retry = 0;

        while (retry < 3) {
            try {
                school = await School.create({
                    schoolName,
                    schoolCode: generateSchoolCode(),
                    email,
                    phone,
                    address,
                    city,
                    state,
                    country,
                    pincode,
                    website,
                    principalName,
                });

                break;
            } catch (err) {
                if (err.code === 11000 && err.keyPattern?.schoolCode) {
                    retry++;
                    continue;
                }
                throw err;
            }
        }

        if (!school) {
            return res.status(500).json({
                success: false,
                message: "Unable to generate unique school code",
            });
        }

        return res.status(201).json({
            success: true,
            message: "School registered successfully",
            data: school,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

const login = async (req, res) => {
    try {
        const { emailid, password } = req.body;

        if (!emailid || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
        }

        // Role is unknown at login time — search across all collections
        const result = await findUserAcrossModels({
            email: emailid.trim().toLowerCase(),
        });

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const { user } = result;

        if (user.status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive. Please contact administrator.",
            });
        }

        if (user.mustChangePassword && user.mustChangePassword === 1) {
            const isWelcomePasswordValid = password;
            if (!isWelcomePasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid welcome OTP",
                });
            }
            return res.status(200).json({
                success: true,
                message: "Verified successful",
                isFirstLogin: "Y"
            });
        }

        const isPasswordValid = await bcrypt.compare(
            password,
            user.password
        );

        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password",
            });
        }

        const token = generateToken(user);

        res.cookie(`token_${user.role}_${user._id}`, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        const userData = user.toObject();
        delete userData.password;

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: userData,
        });
    } catch (error) {
        console.error("Login Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: process.env.NODE_ENV === "development"
                ? error.message
                : "Something went wrong",
        });
    }
};

const pendingRequests = async (req, res) => {
    try {
        const { schoolId, role, status } = req.body;
        const allowedStatuses = ["REQUESTED", "ACTIVE", "INACTIVE"];
        const filterStatus = allowedStatuses.includes(status) ? status : "REQUESTED";

        if (!schoolId) {
            return res.status(400).json({
                success: false,
                message: "schoolId is required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid schoolId"
            });
        }

        // Initial stage (no role): return counts for all statuses per role
        if (!role) {
            const counts = {};
            for (const [roleName, Model] of Object.entries(roleModelMap)) {
                const [requested, active, inactive] = await Promise.all([
                    Model.countDocuments({ schoolId, status: "REQUESTED" }),
                    Model.countDocuments({ schoolId, status: "ACTIVE" }),
                    Model.countDocuments({ schoolId, status: "INACTIVE" }),
                ]);

                counts[roleName] = {
                    REQUESTED: requested,
                    ACTIVE: active,
                    INACTIVE: inactive,
                };
            }

            return res.json({
                success: true,
                counts
            });
        }

        const Model = getModelByRole(role);

        if (!Model) {
            return res.status(400).json({
                success: false,
                message: "Invalid role"
            });
        }

        // Role-based: return users filtered by status
        let query = Model.find({
            schoolId,
            status: filterStatus
        }).select("-password");

        // Student.grade is a Class ObjectId — populate name for display
        if (String(role).toUpperCase() === "STUDENT") {
            query = query.populate("grade", "className section");
        }

        // Teacher.department is Department ObjectId[] — populate + resolve names
        if (String(role).toUpperCase() === "TEACHER") {
            query = query.populate({
                path: "department",
                select: "departmentName departmentCode",
            });
        }

        const pendingList = await query.lean();

        const data =
            String(role).toUpperCase() === "TEACHER"
                ? await resolveTeacherDepartmentLabels(pendingList)
                : pendingList;

        return res.status(200).json({
            success: true,
            count: data.length,
            data,
        });

    } catch (error) {
        console.error("Pending Requests Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: process.env.NODE_ENV === "development"
                ? error.message
                : "Something went wrong",
        });
    }
};

const acceptOrRejectRequest = async (req, res) => {
    try {
        const { userId, status, role } = req.body;

        if (!userId || !status || !role) {
            return res.status(400).json({
                success: false,
                message: "userId, role and status are required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid userId"
            });
        }

        if (!["ACTIVE", "INACTIVE"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be ACTIVE or INACTIVE"
            });
        }

        const Model = getModelByRole(role);

        if (!Model) {
            return res.status(400).json({
                success: false,
                message: "Invalid role"
            });
        }

        const user = await Model.findById(userId).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const updatePayload = { status };

        if (
            status === "ACTIVE" &&
            role === "TEACHER" &&
            !user.staffId
        ) {
            try {
                const autoStaffId = await generateTeacherStaffId(user.schoolId);
                updatePayload.staffId = autoStaffId;
                if (!user.employeeId) {
                    updatePayload.employeeId = autoStaffId;
                }
            } catch (genError) {
                return res.status(400).json({
                    success: false,
                    message: genError.message || "Failed to generate staff ID.",
                });
            }
        }

        Object.assign(user, updatePayload);
        await user.save();

        return res.status(200).json({
            success: true,
            message: `Request ${status.toLowerCase()} successfully`,
            data: user
        });

    } catch (error) {
        console.error("Accept/Reject Request Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: process.env.NODE_ENV === "development"
                ? error.message
                : "Something went wrong",
        });
    }
};

const createStudentTeacherParentSchoolAdmin = async (req, res) => {
    try {
        const {
            schoolId,
            role,
            firstName,
            lastName,
            email,
            phonecode,
            phone,
            gender,

            // Student
            admissionNumber,
            rollNumber,
            grade,
            section,

            // Teacher
            employeeId,
            department,
            qualification,
            subjects,

            // Parent
            relationship,
            children
        } = req.body;
        const normalizedPhoneCode = normalizePhoneCode(phonecode);

        if (
            !schoolId ||
            !role ||
            !firstName ||
            !lastName ||
            !email ||
            !phone ||
            !gender
        ) {
            return res.status(400).json({
                success: false,
                message: "Required fields are missing."
            });
        }

        switch (role) {
            case "STUDENT":
                if (!admissionNumber || !rollNumber || !grade || !section) {
                    return res.status(400).json({
                        success: false,
                        message: "Student details are required."
                    });
                }
                break;

            case "TEACHER":
                if (!department || !qualification) {
                    return res.status(400).json({
                        success: false,
                        message: "Department and Qualification are required."
                    });
                }
                break;

            case "PARENT":
                if (!relationship) {
                    return res.status(400).json({
                        success: false,
                        message: "Relationship is required."
                    });
                }
                break;

            case "SCHOOL_ADMIN":
                break;
            case "SUPER_ADMIN":
                break;

            default:
                return res.status(400).json({
                    success: false,
                    message: "Invalid role."
                });
        }

        const Model = getModelByRole(role);

        if (!Model) {
            return res.status(400).json({
                success: false,
                message: "Invalid role."
            });
        }

        const existingUser = await Model.findOne({
            $or: [
                { email },
                {
                    phone,
                    phoneCode: normalizedPhoneCode
                }
            ]
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Email or Phone already exists."
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        const userData = {
            schoolId,
            role,
            firstName,
            lastName,
            email,
            phone,
            phoneCode: normalizedPhoneCode,
            password: null,
            isVerified: false,
            welcomeOTP: otp,
            mustChangePassword: 1,
            status: "ACTIVE",
            gender
        };

        if (role === "STUDENT") {
            userData.admissionNumber = admissionNumber;
            userData.rollNumber = rollNumber;
            userData.grade = grade;
            userData.section = section;
        }

        if (role === "TEACHER") {
            let autoStaffId;
            try {
                autoStaffId = await generateStaffEmployeeId(schoolId);
            } catch (genError) {
                return res.status(400).json({
                    success: false,
                    message: genError.message || "Failed to generate staff ID.",
                });
            }

            userData.staffId = autoStaffId;
            userData.employeeId = autoStaffId;
            userData.department = department;
            userData.qualification = qualification;
            userData.subjects = subjects;
        }

        if (role === "SCHOOL_ADMIN") {
            try {
                userData.employeeId = await generateStaffEmployeeId(schoolId);
            } catch (genError) {
                return res.status(400).json({
                    success: false,
                    message: genError.message || "Failed to generate employee ID.",
                });
            }
        }

        if (role === "PARENT") {
            userData.relationship = relationship;
            userData.children = children;
        }

        const user = await Model.create(userData);

        // await sendOTPEmail(user.email, user.firstName, otp);

        return res.status(201).json({
            success: true,
            message: `${role} created successfully. OTP has been sent to the registered email.`,
            data: {
                id: user._id,
                role: user.role,
                email: user.email
            }
        });

    } catch (error) {
        console.error("Create User Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error:
                process.env.NODE_ENV === "development"
                    ? error.message
                    : "Something went wrong"
        });
    }
};

const setNewPassword = async (req, res) => {
    try {
        const { email, password, role } = req.body;

        if (!email || !password || !role) {
            return res.status(400).json({
                success: false,
                message: "Email, role and password are required."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long."
            });
        }

        const Model = getModelByRole(role);

        if (!Model) {
            return res.status(400).json({
                success: false,
                message: "Invalid role."
            });
        }

        const user = await Model.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        user.password = hashedPassword;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password has been set successfully."
        });

    } catch (error) {
        console.error("setNewPassword Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: process.env.NODE_ENV === "development"
                ? error.message
                : "Something went wrong",
        });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        // Role unknown — search across all collections
        const result = await findUserAcrossModels({ email });

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const { user } = result;

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        user.forgotOtp = otp;
        await user.save();

        // await sendOTPEmail(user.email, user.firstName, otp);

        return res.status(200).json({
            success: true,
            message: "OTP has been sent to your registered email."
        });

    } catch (error) {
        console.error("forgotPassword Error:", error);

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

const verifyForgotOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required."
            });
        }

        // Role unknown — search across all collections
        const result = await findUserAcrossModels({ email });

        if (!result) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const { user } = result;

        if (!user.forgotOtp) {
            return res.status(400).json({
                success: false,
                message: "No OTP found. Please request a new OTP."
            });
        }

        if (user.forgotOtp !== otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP."
            });
        }

        if (user.forgotOtpExpiry < new Date()) {
            return res.status(400).json({
                success: false,
                message: "OTP has expired."
            });
        }

        user.forgotOtp = null;
        await user.save();

        return res.status(200).json({
            success: true,
            message: "OTP verified successfully."
        });

    } catch (error) {
        console.error("verifyForgotOtp Error:", error);

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

const getAllSchools = async (req, res) => {
    try {
        const allSchools = await School.find({})
            .select("schoolName _id");

        return res.status(200).json({
            success: true,
            message: "Schools fetched successfully",
            data: allSchools,
        });
    } catch (error) {
        console.error("getAllSchools Error:", error);

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

const updateProfile = async (req, res) => {
    try {
        const {
            userId,
            role,
            firstName,
            lastName,
            email,
            phone,
            phoneCode,
            gender,
            dob,
            address,
        } = req.body;

        if (!userId || !role) {
            return res.status(400).json({
                success: false,
                message: "userId and role are required.",
            });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid userId.",
            });
        }

        const Model = getModelByRole(role);
        if (!Model) {
            return res.status(400).json({
                success: false,
                message: "Invalid role.",
            });
        }

        const user = await Model.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        if (firstName !== undefined) {
            const trimmed = String(firstName).trim();
            if (!trimmed) {
                return res.status(400).json({
                    success: false,
                    message: "First name is required.",
                });
            }
            user.firstName = trimmed;
        }

        if (lastName !== undefined) {
            user.lastName = String(lastName).trim();
        }

        if (email !== undefined) {
            const nextEmail = String(email).trim().toLowerCase();
            if (!nextEmail) {
                return res.status(400).json({
                    success: false,
                    message: "Email is required.",
                });
            }

            if (nextEmail !== user.email) {
                const emailTaken = await Model.findOne({
                    email: nextEmail,
                    _id: { $ne: userId },
                }).lean();

                if (emailTaken) {
                    return res.status(409).json({
                        success: false,
                        message: "Email already exists.",
                    });
                }
            }

            user.email = nextEmail;
        }

        if (phone !== undefined) {
            const nextPhone = String(phone).trim();
            if (!nextPhone) {
                return res.status(400).json({
                    success: false,
                    message: "Phone is required.",
                });
            }

            if (nextPhone !== user.phone) {
                const phoneTaken = await Model.findOne({
                    phone: nextPhone,
                    _id: { $ne: userId },
                }).lean();

                if (phoneTaken) {
                    return res.status(409).json({
                        success: false,
                        message: "Phone already exists.",
                    });
                }
            }

            user.phone = nextPhone;
        }

        if (phoneCode !== undefined) {
            user.phoneCode = normalizePhoneCode(phoneCode);
        } else if (!user.phoneCode) {
            user.phoneCode = "91";
        }

        if (gender !== undefined) {
            const nextGender = String(gender).trim();
            if (nextGender && !["Male", "Female", "Other"].includes(nextGender)) {
                return res.status(400).json({
                    success: false,
                    message: "Gender must be Male, Female, or Other.",
                });
            }
            user.gender = nextGender || undefined;
        }

        if (dob !== undefined) {
            if (!dob) {
                user.dob = undefined;
            } else {
                const parsed = new Date(dob);
                if (Number.isNaN(parsed.getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: "Invalid date of birth.",
                    });
                }
                user.dob = parsed;
            }
        }

        if (address !== undefined) {
            user.address = String(address).trim();
        }

        await user.save();

        const userData = user.toObject();
        delete userData.password;
        delete userData.forgotOtp;
        delete userData.welcomeOTP;

        return res.status(200).json({
            success: true,
            message: "Profile updated successfully.",
            data: userData,
        });
    } catch (error) {
        console.error("updateProfile Error:", error);

        if (error?.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0] || "field";
            return res.status(409).json({
                success: false,
                message: `${field} already exists.`,
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

module.exports = {
    getAllSchools,
    register,
    login,
    registerSchool,
    acceptOrRejectRequest,
    pendingRequests,
    setNewPassword,
    createStudentTeacherParentSchoolAdmin,
    verifyForgotOtp,
    forgotPassword,
    updateProfile,
};
