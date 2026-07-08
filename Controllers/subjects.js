const addSubjects = await(req, res) => {
    try {
        const {
            schoolid,
            classid,
            subjectName, subjectCode, description, createdBy
        } = req.body
        if (!schoolId || !classId || !subjectName || !subjectCode || !createdBy) {
            return res.status(400).json({
                success: false,
                message: "schoolId, classId, subjectName, subjectCode and createdBy are required.",
            });
        }




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
}