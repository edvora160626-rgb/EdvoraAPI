const createDepartment = async (req, res) => {
    try {
       const {
        schoolId, departmentName, departmentHead, description,email,phone,phoneCode,branch,
        parentDepartment, isParentDept, createdBy, createdAt, updatedAt
       } =req.body


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
    
};

