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
        console.log("HERE")
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

        if (!role || !firstName || !email || !phone || !password) {
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

        const user = await User.create({
            schoolId,
            role,
            firstName,
            lastName,
            email,
            phone,
            phoneCode:phonecode,
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

        generateToken(user)


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
                : undefined,
        });
    }
};

module.exports = {
    register,
    login,
    registerSchool
};