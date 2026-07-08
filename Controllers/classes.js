const ClassesModel = require("../models/Classes.model");

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
        const { schoolId, flag } = req.body;

        if (!schoolId) {
            return res.status(400).json({
                success: false,
                message: "schoolId is required.",
            });
        }

        // Return only count
        if (flag === "COUNT") {
            const classesCount = await ClassesModel.countDocuments({
                schoolId,
                status: "ACTIVE",
            });

            return res.status(200).json({
                success: true,
                classesCount,
            });
        }

        // Return only class list
        const classes = await ClassesModel.find({
            schoolId,
            status: "ACTIVE",
        })
            .select("className section classTeacherId strength status")
            .sort({ className: 1, section: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: "Active classes fetched successfully.",
            totalClasses: classes.length,
            data: classes,
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





module.exports = { addClasses, getActiveClassesBySchool };