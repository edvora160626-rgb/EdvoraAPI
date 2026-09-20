const mongoose = require("mongoose");
const SubjectsModel = require("../models/Subjects.model");
const Class = require("../models/Classes.model");
const SubjectAllocation = require("../models/SubjectAllocation.model");
const Timetable = require("../models/Timetable.model");
const { generateUniqueCode } = require("../utils/generateUniqueCode");

const isValidId = (value) => mongoose.Types.ObjectId.isValid(value);

const normalizeClassIds = (value) => {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((id) => String(id || "").trim())
        .filter((id) => id && isValidId(id))
    ),
  ];
};

/** Resolve assigned class ids (supports legacy classId). */
const getAssignedClassIds = (subject) => {
  const ids = new Set();
  if (Array.isArray(subject.classIds)) {
    subject.classIds.forEach((id) => {
      if (id) ids.add(String(id._id || id));
    });
  }
  if (subject.classId) {
    ids.add(String(subject.classId._id || subject.classId));
  }
  return [...ids];
};

const classFilterForSubject = (classId) => {
  const classObjectId = isValidId(classId)
    ? new mongoose.Types.ObjectId(classId)
    : classId;
  return {
    $or: [{ classIds: classObjectId }, { classId: classObjectId }],
  };
};

const addSubjects = async (req, res) => {
  try {
    const {
      schoolId,
      subjectName,
      description,
      status,
      classIds,
      createdBy,
    } = req.body;

    if (!schoolId || !subjectName || !createdBy) {
      return res.status(400).json({
        success: false,
        message: "schoolId, subjectName and createdBy are required.",
      });
    }

    if (!isValidId(schoolId)) {
      return res.status(400).json({
        success: false,
        message: "Valid schoolId is required.",
      });
    }

    const assignedClassIds = normalizeClassIds(classIds);

    if (assignedClassIds.length) {
      const count = await Class.countDocuments({
        schoolId,
        _id: { $in: assignedClassIds },
      });
      if (count !== assignedClassIds.length) {
        return res.status(400).json({
          success: false,
          message: "One or more classes were not found for this school.",
        });
      }
    }

    const existingName = await SubjectsModel.findOne({
      schoolId,
      subjectName: {
        $regex: new RegExp(`^${subjectName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      },
    }).lean();

    if (existingName) {
      return res.status(409).json({
        success: false,
        message: "Subject already exists in this school.",
      });
    }

    const subjectCode = await generateUniqueCode({
      Model: SubjectsModel,
      schoolId,
      field: "subjectCode",
      name: subjectName,
    });

    const nextStatus = status === "INACTIVE" ? "INACTIVE" : "ACTIVE";

    const newSubject = await SubjectsModel.create({
      schoolId,
      classIds: assignedClassIds,
      classId: null,
      subjectName: subjectName.trim(),
      subjectCode,
      description: description?.trim() || "",
      status: nextStatus,
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
        message: "Subject name or code already exists in this school.",
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

const getSubjectsBySchool = async (req, res) => {
  try {
    const { schoolId, status } = req.body;

    if (!schoolId || !isValidId(schoolId)) {
      return res.status(400).json({
        success: false,
        message: "Valid schoolId is required.",
      });
    }

    const filter = { schoolId };
    if (status === "ACTIVE" || status === "INACTIVE") {
      filter.status = status;
    }

    const [subjects, activeCount, inactiveCount] = await Promise.all([
      SubjectsModel.find(filter)
        .populate("classIds", "_id className section status")
        .sort({ subjectName: 1 })
        .lean(),
      SubjectsModel.countDocuments({ schoolId, status: "ACTIVE" }),
      SubjectsModel.countDocuments({ schoolId, status: "INACTIVE" }),
    ]);

    const data = subjects.map((s) => ({
      ...s,
      assignedClassIds: getAssignedClassIds(s),
      classCount: getAssignedClassIds(s).length,
    }));

    return res.status(200).json({
      success: true,
      totalSubjects: activeCount + inactiveCount,
      counts: { ACTIVE: activeCount, INACTIVE: inactiveCount },
      status: status || "ALL",
      data,
    });
  } catch (error) {
    console.error("getSubjectsBySchool Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const getSubjectsByClass = async (req, res) => {
  try {
    const { schoolId, classId, status } = req.body;

    if (!schoolId || !classId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and classId are required.",
      });
    }

    if (!isValidId(classId) || !isValidId(schoolId)) {
      return res.status(400).json({
        success: false,
        message: "Valid schoolId and classId are required.",
      });
    }

    const filter = {
      schoolId,
      ...classFilterForSubject(classId),
    };
    if (status === "ACTIVE" || status === "INACTIVE") {
      filter.status = status;
    }

    const subjects = await SubjectsModel.find(filter)
      .sort({ subjectName: 1 })
      .lean();

    const [activeCount, inactiveCount] = await Promise.all([
      SubjectsModel.countDocuments({
        schoolId,
        status: "ACTIVE",
        ...classFilterForSubject(classId),
      }),
      SubjectsModel.countDocuments({
        schoolId,
        status: "INACTIVE",
        ...classFilterForSubject(classId),
      }),
    ]);

    return res.status(200).json({
      success: true,
      totalSubjects: activeCount + inactiveCount,
      counts: { ACTIVE: activeCount, INACTIVE: inactiveCount },
      status: status || "ALL",
      data: subjects,
    });
  } catch (error) {
    console.error("getSubjectsByClass Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const assignSubjectToClasses = async (req, res) => {
  try {
    const { schoolId, subjectId, classIds, updatedBy } = req.body;

    if (!schoolId || !subjectId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and subjectId are required.",
      });
    }

    if (!isValidId(subjectId)) {
      return res.status(400).json({
        success: false,
        message: "Valid subjectId is required.",
      });
    }

    const subject = await SubjectsModel.findOne({ _id: subjectId, schoolId });
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found.",
      });
    }

    const assignedClassIds = normalizeClassIds(classIds);

    if (assignedClassIds.length) {
      const count = await Class.countDocuments({
        schoolId,
        _id: { $in: assignedClassIds },
      });
      if (count !== assignedClassIds.length) {
        return res.status(400).json({
          success: false,
          message: "One or more classes were not found for this school.",
        });
      }
    }

    subject.classIds = assignedClassIds;
    subject.classId = null;
    subject.updatedBy = updatedBy || null;
    await subject.save();

    const populated = await SubjectsModel.findById(subject._id)
      .populate("classIds", "_id className section status")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Subject classes updated.",
      data: {
        ...populated,
        assignedClassIds: getAssignedClassIds(populated),
        classCount: getAssignedClassIds(populated).length,
      },
    });
  } catch (error) {
    console.error("assignSubjectToClasses Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const updateSubject = async (req, res) => {
  try {
    const { schoolId, subjectId, subjectName, description, updatedBy } =
      req.body;

    if (!schoolId || !subjectId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and subjectId are required.",
      });
    }

    if (!isValidId(subjectId)) {
      return res.status(400).json({
        success: false,
        message: "Valid subjectId is required.",
      });
    }

    if (!subjectName?.trim()) {
      return res.status(400).json({
        success: false,
        message: "subjectName is required.",
      });
    }

    const subject = await SubjectsModel.findOne({ _id: subjectId, schoolId });
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found.",
      });
    }

    const nextName = subjectName.trim();

    const duplicate = await SubjectsModel.findOne({
      schoolId,
      _id: { $ne: subjectId },
      subjectName: {
        $regex: new RegExp(
          `^${nextName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i"
        ),
      },
    }).lean();

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "Another subject with this name already exists.",
      });
    }

    subject.subjectName = nextName;
    if (description !== undefined) {
      subject.description = String(description).trim();
    }
    subject.updatedBy = updatedBy || null;
    await subject.save();

    return res.status(200).json({
      success: true,
      message: "Subject updated successfully.",
      data: subject,
    });
  } catch (error) {
    console.error("updateSubject Error:", error);
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Subject name already exists.",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const updateSubjectStatus = async (req, res) => {
  try {
    const { schoolId, subjectId, status, updatedBy } = req.body;

    if (!schoolId || !subjectId || !status) {
      return res.status(400).json({
        success: false,
        message: "schoolId, subjectId and status are required.",
      });
    }

    if (!["ACTIVE", "INACTIVE"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be ACTIVE or INACTIVE.",
      });
    }

    const subject = await SubjectsModel.findOne({ _id: subjectId, schoolId });
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found.",
      });
    }

    subject.status = status;
    subject.updatedBy = updatedBy || null;
    await subject.save();

    return res.status(200).json({
      success: true,
      message:
        status === "INACTIVE"
          ? "Subject marked as inactive."
          : "Subject marked as active.",
      data: subject,
    });
  } catch (error) {
    console.error("updateSubjectStatus Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

const deleteSubject = async (req, res) => {
  try {
    const { schoolId, subjectId } = req.body;

    if (!schoolId || !subjectId) {
      return res.status(400).json({
        success: false,
        message: "schoolId and subjectId are required.",
      });
    }

    if (!isValidId(subjectId)) {
      return res.status(400).json({
        success: false,
        message: "Valid subjectId is required.",
      });
    }

    const subject = await SubjectsModel.findOne({ _id: subjectId, schoolId });
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found.",
      });
    }

    const [allocationCount, timetableUse] = await Promise.all([
      SubjectAllocation.countDocuments({ schoolId, subjectId }),
      Timetable.countDocuments({
        schoolId,
        "entries.subjectId": subjectId,
      }),
    ]);

    if (allocationCount > 0 || timetableUse > 0) {
      return res.status(409).json({
        success: false,
        message:
          "Cannot delete subject while it is used in timetable allocations or class schedules. Deactivate it instead.",
      });
    }

    await SubjectsModel.deleteOne({ _id: subjectId, schoolId });

    return res.status(200).json({
      success: true,
      message: "Subject deleted successfully.",
    });
  } catch (error) {
    console.error("deleteSubject Error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

module.exports = {
  addSubjects,
  getSubjectsBySchool,
  getSubjectsByClass,
  assignSubjectToClasses,
  updateSubject,
  updateSubjectStatus,
  deleteSubject,
};
