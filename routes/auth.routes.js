const express = require("express");
const { registerSchool, login, register } = require("../Controllers/auth");
const router = express.Router();


router.post("/registerSchool",registerSchool);
router.post("/register",register);
router.post("/login",login);



module.exports = router;