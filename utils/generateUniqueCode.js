/**
 * Generate a unique short code for a school-scoped entity from its name.
 * e.g. "Mathematics" → MATH, MATH2…  |  "Computer Science" → CS, CS2…
 */

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugFromName(name = "", maxLen = 6) {
  const words = String(name)
    .trim()
    .split(/[\s.,\-_/&]+/)
    .map((w) => w.trim())
    .filter(Boolean);

  let base = "";
  if (words.length >= 2) {
    base = words
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  if (base.length < 2) {
    base = String(name)
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, maxLen);
  }

  if (!base) base = "CODE";
  if (base.length > maxLen) base = base.slice(0, maxLen);
  return base;
}

/**
 * @param {object} opts
 * @param {import('mongoose').Model} opts.Model
 * @param {string} opts.schoolId
 * @param {string} opts.field - e.g. subjectCode | departmentCode | code
 * @param {string} opts.name - human name used to build the base slug
 * @param {object} [opts.extraFilter] - e.g. { classId }
 * @param {number} [opts.maxLen]
 * @param {string} [opts.excludeId] - document id to ignore (updates)
 */
async function generateUniqueCode({
  Model,
  schoolId,
  field,
  name,
  extraFilter = {},
  maxLen = 8,
  excludeId = null,
}) {
  if (!schoolId) {
    throw new Error("schoolId is required to generate a unique code.");
  }
  if (!field) {
    throw new Error("field is required to generate a unique code.");
  }

  const base = slugFromName(name, Math.min(6, maxLen));
  const filter = {
    schoolId,
    ...extraFilter,
    [field]: { $regex: new RegExp(`^${escapeRegex(base)}\\d*$`, "i") },
  };
  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const existing = await Model.find(filter).select(field).lean();
  const used = new Set(
    existing.map((doc) => String(doc[field] || "").toUpperCase())
  );

  if (!used.has(base)) return base;

  for (let i = 2; i < 10000; i += 1) {
    const candidate = `${base}${i}`;
    if (!used.has(candidate)) return candidate;
  }

  return `${base}${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

module.exports = {
  slugFromName,
  generateUniqueCode,
};
