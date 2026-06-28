const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const School = require("../models/School");
const generateToken = require("../utils/generateJwt");

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

            admissionNumber,
            rollNumber,
            grade,
            section,

            employeeId,
            department,
            qualification,
            subjects,

            relationship,
            children
        } = req.body;

        if (!role || !firstName || !email || !phone || !phonecode || !password) {
            return res.status(400).json({
                success: false,
                message: "Required fields missing"
            });
        }

        const existingUser = await User.findOne({
            $or: [
                { email },
                { phone }
            ]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "User already exists"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        if (role === "STUDENT") {
            if (!admissionNumber || !grade) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide admission number and grade"
                });
            }
        }

        if (role === "TEACHER") {
            if (!employeeId || !department || !qualification) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide employeeId,department and qualification"
                });
            }

        }

        if (role === "PARENT") {
            if (!employeeId || !department || !qualification) {
                return res.status(400).json({
                    success: false,
                    message: "Please provide employeeId,department and qualification"
                });
            }

        }
        const user = await User.create({
            schoolId,
            role,
            firstName,
            lastName,
            email,
            phone,
            phoneCode: phonecode,
            password: hashedPassword,
            admissionNumber,
            rollNumber,
            grade,
            section,
            employeeId,
            department,
            qualification,
            subjects,
            relationship,
            children
        });

        res.status(200).json({
            success: true,
            message: `${role} registered successfully`,
            data: user
        });

    } catch (error) {
        console.log(error);

        res.status(500).json({
            success: false,
            message: error.message
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

        // Check duplicate email/phone
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
                // Duplicate schoolCode generated
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

        // Validate request
        if (!emailid || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required",
            });
        }

        // Find user
        const user = await User.findOne({
            email: emailid.trim().toLowerCase(),
        });

        // User not found
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Check account status
        if (user.status !== "ACTIVE") {
            return res.status(403).json({
                success: false,
                message: "Your account is inactive. Please contact administrator.",
            });
        }

        if (user.mustChangePassword && user?.mustChangePassword === 1) {
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
            })
        }



        // Verify password
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

        let token = generateToken(user)


        res.cookie(`token_${user.role}_${user._id}`, token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });


        // Remove sensitive data
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

        if (!schoolId || !role) {
            return res.status(400).json({
                success: false,
                message: "schoolId and role are required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(schoolId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid schoolId"
            });
        }

        const pendingRequests = await User.find({
            schoolId,
            role,
            status: "REQUESTED"
        }).select("-password");

        return res.status(200).json({
            success: true,
            count: pendingRequests.length,
            data: pendingRequests
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
        const { userId, status } = req.body;

        if (!userId || !status) {
            return res.status(400).json({
                success: false,
                message: "userId and status are required"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid userId"
            });
        }

        if (!["APPROVED", "REJECTED"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be APPROVED or REJECTED"
            });
        }

        const user = await User.findByIdAndUpdate(
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

        // Basic Validation
        if (
            !schoolId ||
            !role ||
            !firstName ||
            !lastName ||
            !email ||
            !phonecode ||
            !phone || !gender
        ) {
            return res.status(400).json({
                success: false,
                message: "Required fields are missing."
            });
        }

        // Role Specific Validation
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

            default:
                return res.status(400).json({
                    success: false,
                    message: "Invalid role."
                });
        }

        // Check duplicate Email/Phone
        const existingUser = await User.findOne({
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

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();


        // Prepare User Data
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

        // Student Fields
        if (role === "STUDENT") {
            userData.admissionNumber = admissionNumber;
            userData.rollNumber = rollNumber;
            userData.grade = grade;
            userData.section = section;
        }

        // Teacher Fields
        if (role === "TEACHER") {
            userData.employeeId = employeeId;
            userData.department = department;
            userData.qualification = qualification;
            userData.subjects = subjects;
        }

        // Parent Fields
        if (role === "PARENT") {
            userData.relationship = relationship;
            userData.children = children;
        }

        // Create User
        const user = await User.create(userData);

        // Send OTP Email
        // await sendOTPEmail(
        //     user.email,
        //     user.firstName,
        //     otp
        // );

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
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters long."
            });
        }

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (!user.isVerified) {
            return res.status(400).json({
                success: false,
                message: "Email is not verified."
            });
        }

        if (user.password) {
            return res.status(400).json({
                success: false,
                message: "Password has already been set."
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

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (!user.isVerified) {
            return res.status(400).json({
                success: false,
                message: "Email is not verified."
            });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        user.forgotOtp = otp;
        // user.forgotOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);

        await user.save();

        // await sendOTPEmail(
        //     user.email,
        //     user.firstName,
        //     otp
        // );

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

        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        if (
            !user.forgotOtp
        ) {
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
module.exports = {
    register,
    login,
    registerSchool,
    acceptOrRejectRequest,
    pendingRequests,
    setNewPassword,
    createStudentTeacherParentSchoolAdmin,
    acceptOrRejectRequest,
    verifyForgotOtp,
    forgotPassword


};