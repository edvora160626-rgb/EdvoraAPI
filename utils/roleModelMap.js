const ProductAdmin = require("../models/ProductAdmin");
const SuperAdmin = require("../models/SuperAdmin");
const SchoolAdmin = require("../models/SchoolAdmin");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const ExamCandidate = require("../models/ExamCandidate");
const { isDbReady } = require("../middleware/requireDb");

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
const EXAM_USER_ROLES = ["EXAM_ADMIN", "EXAM_CANDIDATE"];
/** @deprecated use EXAM_USER_ROLES — kept for older callers */
const EXAM_ROLE = "EXAM_CANDIDATE";

const getModelByRole = (role) => {
  if (EXAM_USER_ROLES.includes(role)) return ExamCandidate;
  return roleModelMap[role] || null;
};

const isExamPortalRole = (role) => EXAM_USER_ROLES.includes(role);

const LOGIN_USER_FIELDS =
  "firstName lastName email role schoolId status password mustChangePassword phone phoneCode profileImage gender department employeeId staffId admissionNumber rollNumber grade section children relationship";

function buildFindOne(Model, query, { lean = false, projection } = {}) {
  let q = Model.findOne(query);
  if (projection) q = q.select(projection);
  if (lean) q = q.lean();
  return q;
}

/** Resolve the first successful lookup; ignore per-collection misses. */
function firstMatch(promises) {
  return new Promise((resolve, reject) => {
    const total = promises.length;
    if (!total) {
      resolve(null);
      return;
    }

    let remaining = total;
    let settled = false;
    let firstError = null;

    for (const promise of promises) {
      promise.then(
        (value) => {
          if (settled) return;
          if (value) {
            settled = true;
            resolve(value);
            return;
          }
          remaining -= 1;
          if (remaining === 0) {
            if (firstError) reject(firstError);
            else resolve(null);
          }
        },
        (error) => {
          if (settled) return;
          if (!firstError) firstError = error;
          remaining -= 1;
          if (remaining === 0) reject(firstError);
        }
      );
    }
  });
}

function assertDbReady() {
  if (isDbReady()) return;
  const err = new Error("Database is unavailable");
  err.status = 503;
  throw err;
}

const findUserAcrossModels = async (query, options = {}) => {
  assertDbReady();
  const lookups = Object.values(roleModelMap).map(async (Model) => {
    const user = await buildFindOne(Model, query, options);
    return user ? { user, Model } : null;
  });
  return firstMatch(lookups);
};

const findExamCandidate = async (query, options = {}) => {
  assertDbReady();
  const user = await buildFindOne(ExamCandidate, query, options);
  if (user) return { user, Model: ExamCandidate };
  return null;
};

const findUserById = async (id, role, options = {}) => {
  assertDbReady();
  const opts = {
    lean: options.lean !== false,
    projection: options.projection || "firstName lastName email role",
  };
  if (role) {
    const Model = getModelByRole(role);
    if (Model) {
      const user = await buildFindOne(Model, { _id: id }, opts);
      return user ? { user, Model } : null;
    }
  }
  return findUserAcrossModels({ _id: id }, opts);
};

module.exports = {
  roleModelMap,
  SCHOOL_ROLES,
  EXAM_ROLE,
  EXAM_USER_ROLES,
  LOGIN_USER_FIELDS,
  ExamCandidate,
  getModelByRole,
  isExamPortalRole,
  findUserAcrossModels,
  findUserById,
  findExamCandidate,
};
