const express = require("express");
const { registerSchool, login, register, pendingRequests, acceptOrRejectRequest } = require("../Controllers/auth");
const router = express.Router();


router.post("/registerSchool",registerSchool);
router.post("/register",register);
router.post("/login",login);
router.post("/pendingRequests",pendingRequests);
router.post("/acceptOrRejectRequest",acceptOrRejectRequest);




module.exports = router;