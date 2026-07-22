const mongoose = require("mongoose");
const School = require("../models/School");
const { getModelByRole } = require("./roleModelMap");

const SKIP_SCHOOL_WORDS = new Set([
    "school",
    "schools",
    "the",
    "of",
    "and",
    "for",
    "a",
    "an",
    "at",
]);

/** e.g. "Vidya Vikas Matriculation Higher Secondary School" → "VVMHS" */
function getSchoolInitials(schoolName = "") {
    const initials = String(schoolName)
        .trim()
        .split(/[\s.,\-_/&]+/)
        .map((word) => word.trim())
        .filter((word) => word && !SKIP_SCHOOL_WORDS.has(word.toLowerCase()))
        .map((word) => word[0].toUpperCase())
        .join("");

    return initials || "SCH";
}

function escapeRegex(value = "") {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSchoolStaffId(id, prefix) {
    if (!id || !prefix) return false;
    const pattern = new RegExp(
        `^${escapeRegex(prefix)}_\\d{3,}$`,
        "i"
    );
    return pattern.test(String(id).trim());
}

function parseStaffSeq(id, prefix) {
    const match = String(id || "").match(
        new RegExp(`^${escapeRegex(prefix)}_?(\\d+)$`, "i")
    );
    return match ? parseInt(match[1], 10) : 0;
}

/**
 * Auto employee ID shared by teachers and school admins:
 * VVMHS_001, VVMHS_002, ...
 */
async function generateStaffEmployeeId(schoolId) {
    if (!schoolId || !mongoose.Types.ObjectId.isValid(schoolId)) {
        throw new Error("Valid schoolId is required to generate staff ID.");
    }

    const school = await School.findById(schoolId).select("schoolName").lean();
    if (!school?.schoolName) {
        throw new Error("School not found.");
    }

    const prefix = getSchoolInitials(school.schoolName);
    const staffModels = [
        getModelByRole("TEACHER"),
        getModelByRole("SCHOOL_ADMIN"),
    ];
    const staffGroups = await Promise.all(
        staffModels.map((Model) =>
            Model.find({ schoolId }).select("staffId employeeId").lean()
        )
    );
    const staffMembers = staffGroups.flat();

    let maxSeq = 0;
    for (const staffMember of staffMembers) {
        maxSeq = Math.max(
            maxSeq,
            parseStaffSeq(staffMember.staffId, prefix),
            parseStaffSeq(staffMember.employeeId, prefix)
        );
    }

    return `${prefix}_${String(maxSeq + 1).padStart(3, "0")}`;
}

/**
 * Ensure every teacher has a school-based staffId (VVMHS_001).
 * Backfills missing / legacy IDs like "EMP 02".
 */
async function ensureTeachersHaveStaffIds(schoolId, teachers = []) {
    if (!schoolId || !Array.isArray(teachers) || teachers.length === 0) {
        return teachers;
    }

    const school = await School.findById(schoolId).select("schoolName").lean();
    if (!school?.schoolName) return teachers;

    const prefix = getSchoolInitials(school.schoolName);
    const Teacher = getModelByRole("TEACHER");

    let maxSeq = 0;
    for (const teacher of teachers) {
        maxSeq = Math.max(
            maxSeq,
            parseStaffSeq(teacher.staffId, prefix),
            parseStaffSeq(teacher.employeeId, prefix)
        );
    }

    const updated = [];
    for (const teacher of teachers) {
        if (isSchoolStaffId(teacher.staffId, prefix)) {
            updated.push(teacher);
            continue;
        }

        maxSeq += 1;
        const staffId = `${prefix}_${String(maxSeq).padStart(3, "0")}`;

        await Teacher.findByIdAndUpdate(teacher._id, {
            staffId,
            ...(isSchoolStaffId(teacher.employeeId, prefix)
                ? {}
                : { employeeId: staffId }),
        });

        updated.push({
            ...teacher,
            staffId,
            employeeId: isSchoolStaffId(teacher.employeeId, prefix)
                ? teacher.employeeId
                : staffId,
        });
    }

    return updated;
}

module.exports = {
    getSchoolInitials,
    generateStaffEmployeeId,
    generateTeacherStaffId: generateStaffEmployeeId,
    ensureTeachersHaveStaffIds,
    isSchoolStaffId,
};
