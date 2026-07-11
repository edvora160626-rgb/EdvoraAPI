const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const School = require("../models/School");
const generateToken = require("../utils/generateJwt");
const { getModelByRole, findUserAcrossModels, roleModelMap } = require("../utils/roleModelMap");

const generateSchoolCode = () => {
    return (
        "SCH" +
        Math.random().toString(36).substring(2, 8).toUpperCase()
    );
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

        if (
            !role ||
            !firstName ||
            !lastName ||
            !email ||
            !phone ||
            !phonecode ||
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
                break;

            case "TEACHER":
                if (!employeeId || !department || !qualification) {
                    return res.status(400).json({
                        success: false,
                        message: "Employee ID, Department and Qualification are required."
                    });
                }
                break;

            case "PARENT":
                if (
                    !relationship ||
                    !Array.isArray(children) ||
                    children.length === 0
                ) {
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
                    phoneCode: phonecode
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
            phoneCode: phonecode,
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
            Object.assign(userData, {
                employeeId,
                department,
                qualification,
                subjects
            });
        }

        if (role === "PARENT") {
            Object.assign(userData, {
                relationship,
                children
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
        const { schoolId, role } = req.body;

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

        if (!role) {
            const counts = {}
            for (const [roleName, Model] of Object.entries(roleModelMap)) {
                counts[roleName] = await Model.countDocuments({ schoolId, status: "REQUESTED" })

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

        const pendingList = await Model.find({
            schoolId,
            status: "REQUESTED"
        }).select("-password");

        return res.status(200).json({
            success: true,
            count: pendingList.length,
            data: pendingList
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

        const user = await Model.findByIdAndUpdate(
            userId,
            { status },
            { new: true }
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

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

        if (
            !schoolId ||
            !role ||
            !firstName ||
            !lastName ||
            !email ||
            !phonecode ||
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
                if (!employeeId || !department || !qualification) {
                    return res.status(400).json({
                        success: false,
                        message: "Teacher details are required."
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
                    phoneCode: phonecode
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
            phoneCode: phonecode,
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
            userData.employeeId = employeeId;
            userData.department = department;
            userData.qualification = qualification;
            userData.subjects = subjects;
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
    forgotPassword
};
