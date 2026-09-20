const jwt = require("jsonwebtoken");
const { isExamPortalRole } = require("../utils/roleModelMap");

function examAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token =
      (header.startsWith("Bearer ") && header.slice(7)) ||
      req.cookies?.token ||
      req.headers["x-access-token"];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!isExamPortalRole(decoded.role)) {
      return res.status(403).json({
        success: false,
        message: "Examination portal access only",
      });
    }

    req.examUser = {
      id: String(decoded.id),
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

function requireExamRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.examUser?.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission for this action",
      });
    }
    next();
  };
}

module.exports = examAuth;
module.exports.requireExamRoles = requireExamRoles;
