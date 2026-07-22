const SubjectsModel = require("../models/Subjects.model");

const addSubjects = async (req, res) => {
    try {
        const {
            schoolId,
            classId,
            subjectName,
            subjectCode,
            description,
            createdBy,
        } = req.body;

        if (!schoolId || !classId || !subjectName || !subjectCode || !createdBy) {
            return res.status(400).json({
                success: false,
                message:
                    "schoolId, classId, subjectName, subjectCode and createdBy are required.",
            });
        }

        const existingSubject = await SubjectsModel.findOne({
            schoolId,
            classId,
            $or: [
                { subjectName: subjectName.trim() },
                { subjectCode: subjectCode.trim().toUpperCase() },
            ],
        }).lean();

        if (existingSubject) {
            return res.status(409).json({
                success: false,
                message: "Subject already exists.",
            });
        }

        const newSubject = await SubjectsModel.create({
            schoolId,
            classId,
            subjectName: subjectName.trim(),
            subjectCode: subjectCode.trim().toUpperCase(),
            description: description?.trim() || "",
            createdBy,
            updatedBy: createdBy,
        });

        return res.status(201).json({
            success: true,
            message: "Subject created successfully.",
            data: newSubject,
        });
    } catch (error) {
        console.error("addSubjects Error:", error);

        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "Subject already exists.",
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
    addSubjects,
};
