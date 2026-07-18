const express = require("express");
const {
    registerSchool,
    login,
    register,
    pendingRequests,
    acceptOrRejectRequest,
    verifyForgotOtp,
    forgotPassword,
    setNewPassword,
    createStudentTeacherParentSchoolAdmin,
    getAllSchools,
    updateProfile,
} = require("../Controllers/auth");
const router = express.Router();

router.post("/registerSchool", registerSchool);
router.post("/register", register);
router.post("/login", login);
router.post("/pendingRequests", pendingRequests);
router.post("/acceptOrRejectRequest", acceptOrRejectRequest);
router.post("/createStudentTeacherParentSchoolAdmin", createStudentTeacherParentSchoolAdmin);
router.post("/setNewPassword", setNewPassword);
router.post("/forgotPassword", forgotPassword);
router.post("/verifyForgotOtp", verifyForgotOtp);
router.post("/updateProfile", updateProfile);
router.get("/getAllSchools", getAllSchools);

module.exports = router;