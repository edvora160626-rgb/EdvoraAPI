const ProductAdmin = require("../models/ProductAdmin");
const SuperAdmin = require("../models/SuperAdmin");
const SchoolAdmin = require("../models/SchoolAdmin");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Parent = require("../models/Parent");


const roleModelMap = {
    PRODUCT_ADMIN: ProductAdmin,
    SUPER_ADMIN: SuperAdmin,
    SCHOOL_ADMIN: SchoolAdmin,
    TEACHER: Teacher,
    STUDENT: Student,
    PARENT: Parent,
};


const getModelByRole = (role) => roleModelMap[role] || null;


const findUserAcrossModels = async (query) => {
    for (const [, Model] of Object.entries(roleModelMap)) {
        const user = await Model.findOne(query);
        if (user) return { user, Model };
    }
    return null;
};

module.exports = { roleModelMap, getModelByRole, findUserAcrossModels };
