const ProductAdmin = require("../models/ProductAdmin");
const SuperAdmin = require("../models/SuperAdmin");
const SchoolAdmin = require("../models/SchoolAdmin");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const ExamCandidate = require("../models/ExamCandidate");

/** School portal roles only — never includes exam users. */
const roleModelMap = {
  PRODUCT_ADMIN: ProductAdmin,
  SUPER_ADMIN: SuperAdmin,
  SCHOOL_ADMIN: SchoolAdmin,
  TEACHER: Teacher,
  STUDENT: Student,
  PARENT: Parent,
};

const SCHOOL_ROLES = Object.keys(roleModelMap);
const EXAM_USER_ROLES = [
  "EXAM_ADMIN",
  "EXAM_CANDIDATE",
  "EXAM_PROCTOR",
];
/** @deprecated use EXAM_USER_ROLES — kept for older callers */
const EXAM_ROLE = "EXAM_CANDIDATE";

const getModelByRole = (role) => {
  if (EXAM_USER_ROLES.includes(role)) return ExamCandidate;
  return roleModelMap[role] || null;
};

const isExamPortalRole = (role) => EXAM_USER_ROLES.includes(role);

const findUserAcrossModels = async (query) => {
  for (const [, Model] of Object.entries(roleModelMap)) {
    const user = await Model.findOne(query);
    if (user) return { user, Model };
  }
  return null;
};

const findExamCandidate = async (query) => {
  const user = await ExamCandidate.findOne(query);
  if (user) return { user, Model: ExamCandidate };
  return null;
};

module.exports = {
  roleModelMap,
  SCHOOL_ROLES,
  EXAM_ROLE,
  EXAM_USER_ROLES,
  ExamCandidate,
  getModelByRole,
  isExamPortalRole,
  findUserAcrossModels,
  findExamCandidate,
};
