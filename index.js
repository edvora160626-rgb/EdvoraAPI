require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://edvora-eront.vercel.app",
      "https://edvora-front.vercel.app",
      "https://edvora-eront-gm2kegov3-edvora2.vercel.app",
      "https://edvora-eront-ke8e53793-edvora2.vercel.app"
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Edvora Backend Running"
    });
});
const requireDb = require("./middleware/requireDb");
const { isDbUnavailableError } = requireDb;
const schoolRoutes = require("./routes/auth.routes");
const departmentRoutes = require("./routes/department.routes");
const classesRoutes = require("./routes/classes.routes");
const subjectsRoutes = require("./routes/subjects.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const eventsRoutes = require("./routes/events.routes");
const timetableRoutes = require("./routes/timetable.routes");
const examRoutes = require("./routes/exam.routes");

mongoose.set("bufferCommands", false);

let mongoRetryTimer = null;

function scheduleMongoRetry() {
  if (mongoRetryTimer) return;
  mongoRetryTimer = setTimeout(() => {
    mongoRetryTimer = null;
    connectMongo();
  }, 5000);
}

async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ MONGO_URI is missing");
    return;
  }

  const state = mongoose.connection.readyState;
  if (state === 1 || state === 2) return;

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000,
      maxPoolSize: 20,
      minPoolSize: 2,
      maxIdleTimeMS: 30000,
    });
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error.message);
    scheduleMongoRetry();
  }
}

mongoose.connection.on("disconnected", () => {
  console.warn("⚠️ MongoDB disconnected");
  scheduleMongoRetry();
});

connectMongo();

app.use(requireDb);
app.use("/auth", schoolRoutes);
app.use("/department", departmentRoutes);
app.use("/class", classesRoutes);
app.use("/subject", subjectsRoutes);
app.use("/attendance", attendanceRoutes);
app.use("/events", eventsRoutes);
app.use("/timetable", timetableRoutes);
app.use("/exam", examRoutes);

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "Route Not Found"
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err);

    if (isDbUnavailableError(err)) {
        return res.status(503).json({
            success: false,
            message: "Database is unavailable. Please try again in a moment.",
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error"
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server Running on Port ${PORT}`);
});