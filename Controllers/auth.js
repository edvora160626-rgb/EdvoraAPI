const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const School = require("../models/School");
const Student = require("../models/Student");
const Department = require("../models/Departments.model");
const generateToken = require("../utils/generateJwt");
const generateSetupToken = generateToken.generateSetupToken;
const { persistProfileImage } = require("../utils/profileImage");
const { passwordPolicyMessage } = require("../utils/passwordPolicy");
const {
    loginLockStatus,
    recordLoginFailure,
    clearLoginFailures,
} = require("../utils/loginAttempts");
const { sendStaffWelcomeEmail } = require("../utils/mailer");
const {
    getModelByRole,
    findUserAcrossModels,
    findExamCandidate,
    roleModelMap,
    ExamCandidate,
    EXAM_ROLE,
    EXAM_USER_ROLES,
    LOGIN_USER_FIELDS,
    isExamPortalRole,
} = require("../utils/roleModelMap");

const SENSITIVE_USER_FIELDS = ["password", "forgotOtp", "welcomeOTP", "__v"];

const toPublicUser = (user) => {
    if (!user) return null;
    const data =
        typeof user.toObject === "function" ? user.toObject() : { ...user };
    for (const key of SENSITIVE_USER_FIELDS) {
        delete data[key];
    }
    return data;
};
const { generateStaffEmployeeId } = require("../utils/generateStaffId");
const { isDbUnavailableError } = require("../middleware/requireDb");

const normalizePhoneCode = (value) =>
    String(value ?? "").replace(/\D/g, "") || "91";

function createTemporaryCode() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

async function temporaryCodeMatches(stored, input) {
    const saved = String(stored || "");
    const value = String(input || "");
    if (!saved || !value) return false;
    if (saved.startsWith("$2")) return bcrypt.compare(value, saved);
    return saved === value;
}

const normalizeGender = (value) => {
    const text = String(value || "").trim().toLowerCase();
    if (text === "male") return "Male";
    if (text === "female") return "Female";
    if (text === "other") return "Other";
    return "";
};

const parseCalendarDate = (value) => {
    const text = String(value || "").trim();
    if (!text) return null;

    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const dayFirst = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    let year;
    let month;
    let day;

    if (iso) {
        year = Number(iso[1]);
        month = Number(iso[2]);
        day = Number(iso[3]);
    } else if (dayFirst) {
        day = Number(dayFirst[1]);
        month = Number(dayFirst[2]);
        year = Number(dayFirst[3]);
    } else {
        const parsed = new Date(text);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day
    ) {
        return null;
    }
    return date;
};

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
            const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const pattern = new RegExp(`^${escaped}$`, "i");
            student = await Student.findOne({
                schoolId,
                $or: [
                    { admissionNumber: pattern },
                    { rollNumber: pattern },
                ],
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

async function hydrateParentChildren(parents = []) {
    const ids = new Set();

    for (const parent of parents) {
        for (const child of parent.children || []) {
            const id = child && typeof child === "object" ? child._id : child;
            if (id && mongoose.Types.ObjectId.isValid(id)) ids.add(String(id));
        }
    }

    if (!ids.size) return parents;

    const students = await Student.find({
        _id: { $in: Array.from(ids) },
    })
        .select(
            "firstName lastName admissionNumber rollNumber section grade profileImage"
        )
        .populate("grade", "className section")
        .lean();

    const byId = new Map(students.map((student) => [String(student._id), student]));

    return parents.map((parent) => ({
        ...parent,
        children: (parent.children || [])
            .map((child) => {
                const id = child && typeof child === "object" ? child._id : child;
                return byId.get(String(id)) || null;
            })
            .filter(Boolean),
    }));
}

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
            address,
            profileImage,
            gender,
            dob,

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
        console.log("HERE11")

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
        console.log("HERE22")

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
            password: hashedPassword,
        };

        const trimmedAddress = String(address || "").trim();
        if (trimmedAddress) {
            userData.address = trimmedAddress;
        }

        const nextGender = normalizeGender(gender);
        if (nextGender) {
            userData.gender = nextGender;
        }

        const parsedDob = parseCalendarDate(dob);
        if (parsedDob) {
            userData.dob = parsedDob;
        }

        if (typeof profileImage === "string" && profileImage.startsWith("data:image/")) {
            const savedImage = persistProfileImage(profileImage);
            if (savedImage?.error) {
                return res.status(400).json({
                    success: false,
                    message: savedImage.error,
                });
            }
            if (savedImage?.url) {
                userData.profileImage = savedImage.url;
            }
        }

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
        console.log("Register Error:", error);

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
        const { emailid, password, portalMode } = req.body;
        const portal =
            String(portalMode || "school").toLowerCase() === "examination"
                ? "examination"
                : "school";

        if (!emailid || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
        }

        const email = emailid.trim().toLowerCase();
        const lock = loginLockStatus(email);
        if (lock.locked) {
            return res.status(429).json({
                success: false,
                message: "Too many login attempts. Try again in 15 minutes.",
            });
        }

        // Strict portal isolation: school users ≠ exam candidates.
        // School lookup hits 6 collections in parallel and returns on first hit.
        const lookupOptions = {
            lean: true,
            projection: `${LOGIN_USER_FIELDS} welcomeOTP`,
        };
        const result =
            portal === "examination"
                ? await findExamCandidate({ email }, lookupOptions)
                : await findUserAcrossModels({ email }, lookupOptions);

        if (!result) {
            return res.status(404).json({
                success: false,
                message:
                    portal === "examination"
                        ? "No examination account found for this email. Create an examination account to continue."
                        : "User not found",
            });
        }

        const { user } = result;

        if (portal === "examination" && !isExamPortalRole(user.role)) {
            return res.status(403).json({
                success: false,
                message: "This account cannot access the Examination portal.",
            });
        }

        if (portal === "school" && isExamPortalRole(user.role)) {
            return res.status(403).json({
                success: false,
                message:
                    "This account cannot access the School portal. Switch to Examination.",
            });
        }

        if (user.status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive. Please contact administrator.",
            });
        }

        if (user.mustChangePassword && user.mustChangePassword === 1) {
            const codeMatches = await temporaryCodeMatches(user.welcomeOTP, password);
            if (!codeMatches) {
                const failure = recordLoginFailure(email);
                return res.status(failure.locked ? 429 : 401).json({
                    success: false,
                    message: failure.locked
                        ? "Too many login attempts. Try again in 15 minutes."
                        : "Invalid email or temporary login code",
                });
            }

            clearLoginFailures(email);
            return res.status(200).json({
                success: true,
                message: "Temporary code verified. Create your password.",
                requiresPasswordSetup: true,
                isFirstLogin: "Y",
                setupToken: generateSetupToken(user),
                email: user.email,
                role: user.role,
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password || "");

        if (!isPasswordValid) {
            const failure = recordLoginFailure(email);
            return res.status(failure.locked ? 429 : 401).json({
                success: false,
                message: failure.locked
                    ? "Too many login attempts. Try again in 15 minutes."
                    : "Invalid email or password",
            });
        }

        clearLoginFailures(email);

        const token = generateToken(user);

        res.cookie(`token_${user.role}_${user._id}`, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.status(200).json({
            success: true,
            message: "Login successful",
            token,
            user: toPublicUser(user),
            portalMode: portal,
        });
    } catch (error) {
        console.error("Login Error:", error);

        if (isDbUnavailableError(error)) {
            return res.status(503).json({
                success: false,
                message: "Database is unavailable. Please try again in a moment.",
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

const registerExamCandidate = async (req, res) => {
    try {
        const {
            firstName,
            lastName,
            email,
            phone,
            phonecode,
            password,
            gender,
            userType,
        } = req.body;

        const normalizedPhoneCode = normalizePhoneCode(phonecode);

        if (!firstName || !email || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: "First name, email, phone and password are required.",
            });
        }

        if (String(password).length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must contain at least 8 characters.",
            });
        }

        const typeMap = {
            ADMIN: "EXAM_ADMIN",
            CANDIDATE: "EXAM_CANDIDATE",
            EXAM_ADMIN: "EXAM_ADMIN",
            EXAM_CANDIDATE: "EXAM_CANDIDATE",
        };
        const rawType = String(userType || "CANDIDATE").toUpperCase();
        const role = typeMap[rawType];
        if (!role || !EXAM_USER_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: "Invalid account type. Choose Admin or Candidate.",
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedPhone = String(phone).trim();

        const existing = await ExamCandidate.findOne({
            $or: [
                { email: normalizedEmail },
                { phone: normalizedPhone, phoneCode: normalizedPhoneCode },
            ],
        }).lean();

        if (existing) {
            return res.status(409).json({
                success: false,
                message:
                    "An examination account already exists with this email or phone.",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const candidate = await ExamCandidate.create({
            firstName: String(firstName).trim(),
            lastName: String(lastName || "").trim(),
            email: normalizedEmail,
            phone: normalizedPhone,
            phoneCode: normalizedPhoneCode,
            password: hashedPassword,
            gender: gender || "",
            role,
            status: "ACTIVE",
        });

        const userData = candidate.toObject();
        delete userData.password;

        const labels = {
            EXAM_ADMIN: "Admin",
            EXAM_CANDIDATE: "Candidate",
        };

        return res.status(201).json({
            success: true,
            message: `${labels[role]} account created successfully. You can sign in now.`,
            user: userData,
        });
    } catch (error) {
        console.error("registerExamCandidate Error:", error);

        if (error?.code === 11000) {
            return res.status(409).json({
                success: false,
                message:
                    "An examination account already exists with this email or phone.",
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
            const schoolObjectId = new mongoose.Types.ObjectId(schoolId);
            const counted = await Promise.all(
                Object.entries(roleModelMap).map(async ([roleName, Model]) => {
                    const grouped = await Model.aggregate([
                        { $match: { schoolId: schoolObjectId } },
                        { $group: { _id: "$status", n: { $sum: 1 } } },
                    ]);
                    const bag = { REQUESTED: 0, ACTIVE: 0, INACTIVE: 0 };
                    for (const row of grouped) {
                        if (row?._id && bag[row._id] !== undefined) {
                            bag[row._id] = row.n;
                        }
                    }
                    return [roleName, bag];
                })
            );

            return res.json({
                success: true,
                counts: Object.fromEntries(counted),
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

        if (String(role).toUpperCase() === "PARENT") {
            query = query.populate({
                path: "children",
                select: "firstName lastName admissionNumber rollNumber section grade",
                populate: {
                    path: "grade",
                    select: "className section",
                },
            });
        }

        const pendingList = await query.lean();
        const parentsWithChildren =
            String(role).toUpperCase() === "PARENT"
                ? await hydrateParentChildren(pendingList)
                : pendingList;

        const data =
            String(role).toUpperCase() === "TEACHER"
                ? await resolveTeacherDepartmentLabels(parentsWithChildren)
                : parentsWithChildren;

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
            dob,
            address,
            profileImage,

            // Student
            admissionNumber,
            rollNumber,
            grade,
            section,

            // Teacher
            employeeId,
            department,
            qualification,
            designation,
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
                if (!department || !(designation || qualification)) {
                    return res.status(400).json({
                        success: false,
                        message: "Department and designation are required."
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

        const temporaryCode = createTemporaryCode();
        const temporaryCodeHash = await bcrypt.hash(temporaryCode, 10);

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
            welcomeOTP: temporaryCodeHash,
            mustChangePassword: 1,
            status: "ACTIVE",
            gender: normalizeGender(gender),
        };

        const trimmedAddress = String(address || "").trim();
        if (trimmedAddress) {
            userData.address = trimmedAddress;
        }

        if (typeof profileImage === "string" && profileImage.startsWith("data:image/")) {
            const savedImage = persistProfileImage(profileImage);
            if (savedImage?.error) {
                return res.status(400).json({
                    success: false,
                    message: savedImage.error,
                });
            }
            if (savedImage?.url) {
                userData.profileImage = savedImage.url;
            }
        }

        const parsedDob = parseCalendarDate(dob);
        if (parsedDob) {
            userData.dob = parsedDob;
        }

        if (role === "STUDENT") {
            userData.admissionNumber = admissionNumber;
            userData.rollNumber = rollNumber;
            userData.grade = grade;
            userData.section = section;
        }

        if (role === "TEACHER") {
            const departmentIds = (Array.isArray(department)
                ? department
                : department
                  ? [department]
                  : []
            ).filter((id) => mongoose.Types.ObjectId.isValid(id));

            if (departmentIds.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "At least one valid Department is required.",
                });
            }

            const existingDepartments = await Department.find({
                _id: { $in: departmentIds },
                schoolId,
            }).select("_id");
            if (existingDepartments.length !== departmentIds.length) {
                return res.status(400).json({
                    success: false,
                    message: "Select a department that belongs to this school.",
                });
            }

            let autoStaffId;
            try {
                autoStaffId = await generateStaffEmployeeId(schoolId);
            } catch (genError) {
                return res.status(400).json({
                    success: false,
                    message: genError.message || "Failed to generate staff ID.",
                });
            }

            const normalizedSubjects = Array.isArray(subjects)
                ? subjects.map((s) => String(s).trim()).filter(Boolean)
                : typeof subjects === "string" && subjects.trim()
                  ? subjects
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean)
                  : [];

            userData.staffId = autoStaffId;
            userData.employeeId = autoStaffId;
            userData.department = departmentIds.map(
                (id) => new mongoose.Types.ObjectId(id)
            );
            userData.designation = String(designation || qualification || "").trim();
            userData.qualification = userData.designation;
            userData.subjects = normalizedSubjects;
            userData.status = "ACTIVE";
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

        if (role === "TEACHER" && Array.isArray(userData.department)) {
            await Department.updateMany(
                { _id: { $in: userData.department } },
                { $addToSet: { teacherids: user._id } }
            );
        }

        const mailed = await sendStaffWelcomeEmail({
            to: user.email,
            name: [user.firstName, user.lastName].filter(Boolean).join(" "),
            temporaryCode,
        });

        if (!mailed.sent) {
            await Model.deleteOne({ _id: user._id });
            if (role === "TEACHER" && Array.isArray(userData.department)) {
                await Department.updateMany(
                    { _id: { $in: userData.department } },
                    { $pull: { teacherids: user._id } }
                );
            }
            return res.status(503).json({
                success: false,
                message: mailed.message || "Welcome email could not be sent.",
            });
        }

        return res.status(201).json({
            success: true,
            message: `Staff added successfully. Welcome email sent to ${user.email}.`,
            emailSent: true,
            data: {
                id: user._id,
                role: user.role,
                email: user.email,
                status: user.status,
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
        const { email, password, role, setupToken, newPassword, confirmPassword } = req.body;
        const nextPassword = newPassword || password;

        let resolvedEmail = String(email || "").trim().toLowerCase();
        let resolvedRole = role;
        let fromSetup = false;

        if (setupToken) {
            let payload;
            try {
                payload = jwt.verify(setupToken, process.env.JWT_SECRET);
            } catch {
                return res.status(401).json({
                    success: false,
                    message: "Your setup session expired. Log in again with the temporary code.",
                });
            }
            if (payload?.purpose !== "password_setup") {
                return res.status(401).json({
                    success: false,
                    message: "Invalid password setup session.",
                });
            }
            resolvedEmail = String(payload.email || "").toLowerCase();
            resolvedRole = payload.role;
            fromSetup = true;
        }

        if (!resolvedEmail || !nextPassword || !resolvedRole) {
            return res.status(400).json({
                success: false,
                message: "Email, role and password are required."
            });
        }

        if (fromSetup && confirmPassword !== nextPassword) {
            return res.status(400).json({
                success: false,
                message: "Passwords do not match.",
            });
        }

        const policyError = passwordPolicyMessage(nextPassword);
        if (policyError) {
            return res.status(400).json({
                success: false,
                message: policyError,
            });
        }

        const Model = getModelByRole(resolvedRole);

        if (!Model) {
            return res.status(400).json({
                success: false,
                message: "Invalid role."
            });
        }

        const user = await Model.findOne({ email: resolvedEmail });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (fromSetup && user.mustChangePassword !== 1) {
            return res.status(400).json({
                success: false,
                message: "This account already has a password. Sign in with that password.",
            });
        }

        user.password = await bcrypt.hash(nextPassword, 10);
        user.welcomeOTP = null;
        user.mustChangePassword = 0;
        await user.save();

        if (!fromSetup) {
            return res.status(200).json({
                success: true,
                message: "Password has been set successfully."
            });
        }

        const token = generateToken(user);
        res.cookie(`token_${user.role}_${user._id}`, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.status(200).json({
            success: true,
            message: "Password created. Welcome to Edvora.",
            token,
            user: toPublicUser(user),
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
            message: "OTP has been sent to your registered email.",
            otp,
        });

    } catch (error) {
        console.error("forgotPassword Error:", error);

        if (isDbUnavailableError(error)) {
            return res.status(503).json({
                success: false,
                message: "Database is unavailable. Please try again in a moment.",
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

        if (isDbUnavailableError(error)) {
            return res.status(503).json({
                success: false,
                message: "Database is unavailable. Please try again in a moment.",
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

const getAllSchools = async (req, res) => {
    try {
        const allSchools = await School.find({})
            .select("schoolName _id")
            .lean();

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
            const nextGender = normalizeGender(gender);
            if (String(gender || "").trim() && !nextGender) {
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
                const parsed = parseCalendarDate(dob);
                if (!parsed) {
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

const getStudentsByIds = async (req, res) => {
    try {
        const { schoolId, studentIds } = req.body;
        const ids = (Array.isArray(studentIds) ? studentIds : [])
            .filter((id) => mongoose.Types.ObjectId.isValid(id));

        if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Valid schoolId is required.",
            });
        }

        if (!ids.length) {
            return res.status(200).json({ success: true, data: [] });
        }

        const students = await Student.find({
            schoolId,
            _id: { $in: ids },
        })
            .select(
                "firstName lastName admissionNumber rollNumber section grade profileImage"
            )
            .populate("grade", "className section")
            .lean();

        return res.status(200).json({
            success: true,
            data: students,
        });
    } catch (error) {
        console.error("getStudentsByIds Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};

module.exports = {
    getAllSchools,
    register,
    login,
    registerExamCandidate,
    registerSchool,
    acceptOrRejectRequest,
    pendingRequests,
    getStudentsByIds,
    setNewPassword,
    createStudentTeacherParentSchoolAdmin,
    verifyForgotOtp,
    forgotPassword,
    updateProfile,
};
