const mongoose = require("mongoose");
const Department = require("../models/Departments.model");
const Teacher = require("../models/Teacher");
const School = require("../models/School");

const createDepartment = async (req, res) => {
    try {
        console.log("HERE")
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
            phoneCode: phoneCode?.trim() || "",
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

module.exports = {
    createDepartment,
};