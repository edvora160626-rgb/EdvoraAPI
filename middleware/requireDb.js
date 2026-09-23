const mongoose = require("mongoose");

function isDbReady() {
  return mongoose.connection.readyState === 1;
}

function isDbUnavailableError(error) {
  if (!error) return false;
  if (error.status === 503) return true;
  const message = String(error.message || "");
  return /buffering timed out|Server selection timed out|Database is unavailable/i.test(
    message
  );
}

function requireDb(req, res, next) {
  if (isDbReady()) return next();

  return res.status(503).json({
    success: false,
    message: "Database is unavailable. Please try again in a moment.",
  });
}

module.exports = requireDb;
module.exports.isDbReady = isDbReady;
module.exports.isDbUnavailableError = isDbUnavailableError;
