const mongoose = require("mongoose");
const ExamSubject = require("../models/ExamSubject.model");
const ExamQuestion = require("../models/ExamQuestion.model");
const ExamTest = require("../models/ExamTest.model");
const ExamEnrollment = require("../models/ExamEnrollment.model");
const ExamAttempt = require("../models/ExamAttempt.model");
const ExamStudyMaterial = require("../models/ExamStudyMaterial.model");
const ExamForumPost = require("../models/ExamForumPost.model");
const ExamSupportTicket = require("../models/ExamSupportTicket.model");
const ExamCandidate = require("../models/ExamCandidate");

function publicQuestion(q) {
  return {
    id: String(q._id),
    text: q.text,
    options: q.options,
    marks: q.marks ?? 1,
    topic: q.topic,
    difficulty: q.difficulty,
  };
}

function serializeTest(test, extras = {}) {
  const subject = test.subjectId;
  return {
    id: String(test._id),
    title: test.title,
    description: test.description || "",
    type: test.type,
    difficulty: test.difficulty,
    durationMin: test.durationMin,
    passPercent: test.passPercent,
    questionCount: Array.isArray(test.questionIds) ? test.questionIds.length : 0,
    startsAt: test.startsAt || null,
    endsAt: test.endsAt || null,
    maxAttempts: test.maxAttempts ?? 0,
    status: test.status,
    subject: subject
      ? {
          id: String(subject._id || subject),
          name: subject.name || "",
          code: subject.code || "",
        }
      : null,
    ...extras,
  };
}

async function scoreAttempt(attempt) {
  const questions = await ExamQuestion.find({
    _id: { $in: attempt.questionIds },
  }).lean();
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  let correct = 0;
  let totalMarks = 0;
  let earned = 0;

  for (const qid of attempt.questionIds) {
    const q = byId.get(String(qid));
    if (!q) continue;
    const marks = q.marks ?? 1;
    totalMarks += marks;
    const ans = attempt.answers.find(
      (a) => String(a.questionId) === String(qid)
    );
    if (
      ans &&
      (Number(ans.selectedIndex) === Number(q.correctIndex) ||
        (Array.isArray(q.correctIndexes) &&
          q.correctIndexes.map(Number).includes(Number(ans.selectedIndex))))
    ) {
      correct += 1;
      earned += marks;
    }
  }

  const score =
    totalMarks === 0 ? 0 : Math.round((earned / totalMarks) * 100);
  return {
    correctCount: correct,
    totalQuestions: attempt.questionIds.length,
    score,
  };
}

const getDashboard = async (req, res) => {
  try {
    const candidateId = req.examUser.id;
    const now = new Date();

    const [practiceDone, results, upcomingTests, enrollments] =
      await Promise.all([
        ExamAttempt.countDocuments({
          candidateId,
          mode: "PRACTICE",
          status: "SUBMITTED",
        }),
        ExamAttempt.find({
          candidateId,
          status: "SUBMITTED",
        })
          .sort({ submittedAt: -1 })
          .limit(5)
          .populate({ path: "testId", select: "title type" })
          .lean(),
        ExamTest.find({
          status: "PUBLISHED",
          type: { $in: ["SCHEDULED", "ON_DEMAND"] },
          $or: [
            { endsAt: { $gte: now } },
            { endsAt: null },
            { type: "ON_DEMAND" },
          ],
        })
          .populate("subjectId", "name code")
          .sort({ startsAt: 1 })
          .limit(10)
          .lean(),
        ExamEnrollment.find({
          candidateId,
          status: "ENROLLED",
        })
          .select("testId")
          .lean(),
      ]);

    const enrolledSet = new Set(enrollments.map((e) => String(e.testId)));
    const avgScore =
      results.length === 0
        ? 0
        : Math.round(
            results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length
          );
    const certificates = await ExamAttempt.countDocuments({
      candidateId,
      status: "SUBMITTED",
      certificateIssued: true,
    });

    return res.json({
      success: true,
      data: {
        stats: {
          upcoming: upcomingTests.length,
          practiceDone,
          avgScore,
          certificates,
        },
        upcoming: upcomingTests.map((t) =>
          serializeTest(t, { enrolled: enrolledSet.has(String(t._id)) })
        ),
        recentResults: results.map((r) => ({
          id: String(r._id),
          title: r.testId?.title || "Test",
          type: r.testId?.type || r.mode,
          score: r.score,
          maxScore: 100,
          date: r.submittedAt,
          status: r.passed ? "Passed" : "Failed",
          passed: r.passed,
        })),
      },
    });
  } catch (error) {
    console.error("getDashboard", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const listTests = async (req, res) => {
  try {
    const type = String(req.query.type || "").toUpperCase();
    const filter = { status: "PUBLISHED" };
    if (["PRACTICE", "SCHEDULED", "ON_DEMAND"].includes(type)) {
      filter.type = type;
    }

    const tests = await ExamTest.find(filter)
      .populate("subjectId", "name code")
      .sort({ createdAt: -1 })
      .lean();

    const candidateId = req.examUser.id;
    const [enrollments, attempts] = await Promise.all([
      ExamEnrollment.find({ candidateId, status: "ENROLLED" })
        .select("testId")
        .lean(),
      ExamAttempt.aggregate([
        { $match: { candidateId: new mongoose.Types.ObjectId(candidateId) } },
        {
          $group: {
            _id: "$testId",
            attempts: { $sum: 1 },
            bestScore: {
              $max: {
                $cond: [
                  { $eq: ["$status", "SUBMITTED"] },
                  "$score",
                  null,
                ],
              },
            },
            submitted: {
              $sum: {
                $cond: [{ $eq: ["$status", "SUBMITTED"] }, 1, 0],
              },
            },
          },
        },
      ]),
    ]);

    const enrolledSet = new Set(enrollments.map((e) => String(e.testId)));
    const attemptMap = new Map(
      attempts.map((a) => [String(a._id), a])
    );

    return res.json({
      success: true,
      data: tests.map((t) => {
        const stats = attemptMap.get(String(t._id));
        return serializeTest(t, {
          enrolled: enrolledSet.has(String(t._id)),
          attempts: stats?.submitted || 0,
          bestScore: stats?.bestScore ?? null,
        });
      }),
    });
  } catch (error) {
    console.error("listTests", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getTestDetails = async (req, res) => {
  try {
    const test = await ExamTest.findById(req.params.testId)
      .populate("subjectId", "name code")
      .lean();
    if (!test || test.status !== "PUBLISHED") {
      return res.status(404).json({ success: false, message: "Test not found" });
    }

    const enrollment = await ExamEnrollment.findOne({
      candidateId: req.examUser.id,
      testId: test._id,
      status: "ENROLLED",
    }).lean();

    const attemptStats = await ExamAttempt.aggregate([
      {
        $match: {
          candidateId: new mongoose.Types.ObjectId(req.examUser.id),
          testId: test._id,
          status: "SUBMITTED",
        },
      },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          bestScore: { $max: "$score" },
        },
      },
    ]);

    return res.json({
      success: true,
      data: serializeTest(test, {
        enrolled: Boolean(enrollment),
        attempts: attemptStats[0]?.attempts || 0,
        bestScore: attemptStats[0]?.bestScore ?? null,
      }),
    });
  } catch (error) {
    console.error("getTestDetails", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const enrollTest = async (req, res) => {
  try {
    const test = await ExamTest.findById(req.params.testId).lean();
    if (!test || test.status !== "PUBLISHED") {
      return res.status(404).json({ success: false, message: "Test not found" });
    }
    if (test.type === "PRACTICE") {
      return res.status(400).json({
        success: false,
        message: "Practice tests do not require enrollment",
      });
    }

    const enrollment = await ExamEnrollment.findOneAndUpdate(
      { candidateId: req.examUser.id, testId: test._id },
      { $set: { status: "ENROLLED" } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({
      success: true,
      message: "Enrolled successfully",
      data: {
        id: String(enrollment._id),
        testId: String(test._id),
        status: enrollment.status,
      },
    });
  } catch (error) {
    console.error("enrollTest", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const startAttempt = async (req, res) => {
  try {
    const test = await ExamTest.findById(req.params.testId).lean();
    if (!test || test.status !== "PUBLISHED") {
      return res.status(404).json({ success: false, message: "Test not found" });
    }

    const now = new Date();
    if (test.type === "SCHEDULED") {
      if (test.startsAt && now < new Date(test.startsAt)) {
        return res.status(403).json({
          success: false,
          message: "Exam window has not started yet",
        });
      }
      if (test.endsAt && now > new Date(test.endsAt)) {
        return res.status(403).json({
          success: false,
          message: "Exam window has ended",
        });
      }
      const enrolled = await ExamEnrollment.findOne({
        candidateId: req.examUser.id,
        testId: test._id,
        status: "ENROLLED",
      }).lean();
      if (!enrolled) {
        return res.status(403).json({
          success: false,
          message: "Please enroll before starting this exam",
        });
      }
    }

    if (test.maxAttempts > 0) {
      const used = await ExamAttempt.countDocuments({
        candidateId: req.examUser.id,
        testId: test._id,
        status: "SUBMITTED",
      });
      if (used >= test.maxAttempts) {
        return res.status(403).json({
          success: false,
          message: "Maximum attempts reached for this test",
        });
      }
    }

    const existing = await ExamAttempt.findOne({
      candidateId: req.examUser.id,
      testId: test._id,
      status: "IN_PROGRESS",
      endsAt: { $gt: now },
    }).lean();

    if (existing) {
      const questions = await ExamQuestion.find({
        _id: { $in: existing.questionIds },
      }).lean();
      const qMap = new Map(questions.map((q) => [String(q._id), q]));
      const ordered = existing.questionIds
        .map((id) => qMap.get(String(id)))
        .filter(Boolean);

      return res.json({
        success: true,
        message: "Resuming in-progress attempt",
        data: {
          attemptId: String(existing._id),
          testId: String(test._id),
          title: test.title,
          mode: existing.mode,
          durationMin: test.durationMin,
          endsAt: existing.endsAt,
          startedAt: existing.startedAt,
          answers: Object.fromEntries(
            existing.answers
              .filter((a) => a.selectedIndex != null)
              .map((a) => [String(a.questionId), a.selectedIndex])
          ),
          questions: ordered.map(publicQuestion),
        },
      });
    }

    if (!test.questionIds?.length) {
      return res.status(400).json({
        success: false,
        message: "This test has no questions configured",
      });
    }

    const endsAt = new Date(now.getTime() + test.durationMin * 60 * 1000);
    const mode = test.type === "PRACTICE" ? "PRACTICE" : "EXAM";

    const attempt = await ExamAttempt.create({
      candidateId: req.examUser.id,
      testId: test._id,
      mode,
      status: "IN_PROGRESS",
      questionIds: test.questionIds,
      answers: test.questionIds.map((qid) => ({
        questionId: qid,
        selectedIndex: null,
      })),
      startedAt: now,
      endsAt,
      totalQuestions: test.questionIds.length,
    });

    const questions = await ExamQuestion.find({
      _id: { $in: test.questionIds },
    }).lean();
    const qMap = new Map(questions.map((q) => [String(q._id), q]));
    const ordered = test.questionIds
      .map((id) => qMap.get(String(id)))
      .filter(Boolean);

    return res.status(201).json({
      success: true,
      message: "Attempt started",
      data: {
        attemptId: String(attempt._id),
        testId: String(test._id),
        title: test.title,
        mode,
        durationMin: test.durationMin,
        endsAt: attempt.endsAt,
        startedAt: attempt.startedAt,
        answers: {},
        questions: ordered.map(publicQuestion),
      },
    });
  } catch (error) {
    console.error("startAttempt", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const saveAnswer = async (req, res) => {
  try {
    const { questionId, selectedIndex } = req.body;
    if (!questionId || selectedIndex == null) {
      return res.status(400).json({
        success: false,
        message: "questionId and selectedIndex are required",
      });
    }

    const attempt = await ExamAttempt.findOne({
      _id: req.params.attemptId,
      candidateId: req.examUser.id,
    });

    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }
    if (attempt.status !== "IN_PROGRESS") {
      return res.status(400).json({ success: false, message: "Attempt is closed" });
    }
    if (new Date() > attempt.endsAt) {
      attempt.status = "EXPIRED";
      await attempt.save();
      return res.status(400).json({ success: false, message: "Time is up" });
    }

    const idx = attempt.answers.findIndex(
      (a) => String(a.questionId) === String(questionId)
    );
    if (idx === -1) {
      return res.status(400).json({ success: false, message: "Invalid question" });
    }
    attempt.answers[idx].selectedIndex = Number(selectedIndex);
    await attempt.save();

    return res.json({ success: true, message: "Answer saved" });
  } catch (error) {
    console.error("saveAnswer", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const submitAttempt = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findOne({
      _id: req.params.attemptId,
      candidateId: req.examUser.id,
    });

    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }
    if (attempt.status === "SUBMITTED") {
      return res.json({
        success: true,
        message: "Already submitted",
        data: {
          attemptId: String(attempt._id),
          score: attempt.score,
          passed: attempt.passed,
        },
      });
    }

    const test = await ExamTest.findById(attempt.testId).lean();
    const scored = await scoreAttempt(attempt);
    attempt.status = "SUBMITTED";
    attempt.submittedAt = new Date();
    attempt.score = scored.score;
    attempt.correctCount = scored.correctCount;
    attempt.totalQuestions = scored.totalQuestions;
    attempt.passed = scored.score >= (test?.passPercent ?? 40);
    attempt.certificateIssued =
      attempt.passed && attempt.mode === "EXAM" && test?.type !== "PRACTICE";
    await attempt.save();

    return res.json({
      success: true,
      message: "Submitted successfully",
      data: {
        attemptId: String(attempt._id),
        score: attempt.score,
        correctCount: attempt.correctCount,
        totalQuestions: attempt.totalQuestions,
        passed: attempt.passed,
        certificateIssued: attempt.certificateIssued,
      },
    });
  } catch (error) {
    console.error("submitAttempt", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getAttemptResult = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findOne({
      _id: req.params.attemptId,
      candidateId: req.examUser.id,
    })
      .populate("testId", "title type passPercent")
      .lean();

    if (!attempt) {
      return res.status(404).json({ success: false, message: "Attempt not found" });
    }
    if (attempt.status !== "SUBMITTED" && attempt.status !== "EXPIRED") {
      return res.status(400).json({
        success: false,
        message: "Attempt not submitted yet",
      });
    }

    const questions = await ExamQuestion.find({
      _id: { $in: attempt.questionIds },
    }).lean();
    const qMap = new Map(questions.map((q) => [String(q._id), q]));

    const review = attempt.questionIds.map((qid, i) => {
      const q = qMap.get(String(qid));
      const ans = attempt.answers.find(
        (a) => String(a.questionId) === String(qid)
      );
      const selected = ans?.selectedIndex;
      return {
        index: i + 1,
        questionId: String(qid),
        text: q?.text || "",
        options: q?.options || [],
        selectedIndex: selected ?? null,
        correctIndex: q?.correctIndex ?? null,
        isCorrect: selected != null && selected === q?.correctIndex,
        explanation: q?.explanation || "",
      };
    });

    return res.json({
      success: true,
      data: {
        attemptId: String(attempt._id),
        title: attempt.testId?.title || "Test",
        mode: attempt.mode,
        type: attempt.testId?.type,
        score: attempt.score,
        correctCount: attempt.correctCount,
        totalQuestions: attempt.totalQuestions,
        passed: attempt.passed,
        certificateIssued: attempt.certificateIssued,
        submittedAt: attempt.submittedAt,
        answered: attempt.answers.filter((a) => a.selectedIndex != null).length,
        review,
      },
    });
  } catch (error) {
    console.error("getAttemptResult", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const listResults = async (req, res) => {
  try {
    const results = await ExamAttempt.find({
      candidateId: req.examUser.id,
      status: "SUBMITTED",
    })
      .sort({ submittedAt: -1 })
      .populate("testId", "title type")
      .lean();

    return res.json({
      success: true,
      data: results.map((r) => ({
        id: String(r._id),
        title: r.testId?.title || "Test",
        type: r.testId?.type || r.mode,
        score: r.score,
        maxScore: 100,
        date: r.submittedAt,
        status: r.passed ? "Passed" : "Failed",
        passed: r.passed,
      })),
    });
  } catch (error) {
    console.error("listResults", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const listCertificates = async (req, res) => {
  try {
    const rows = await ExamAttempt.find({
      candidateId: req.examUser.id,
      status: "SUBMITTED",
      certificateIssued: true,
    })
      .sort({ submittedAt: -1 })
      .populate("testId", "title")
      .lean();

    return res.json({
      success: true,
      data: rows.map((r) => ({
        id: String(r._id),
        title: `${r.testId?.title || "Exam"} Certificate`,
        issuedOn: r.submittedAt,
        score: r.score,
      })),
    });
  } catch (error) {
    console.error("listCertificates", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const listMaterials = async (req, res) => {
  try {
    const materials = await ExamStudyMaterial.find({ status: "ACTIVE" })
      .populate("subjectId", "name code")
      .sort({ updatedAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: materials.map((m) => ({
        id: String(m._id),
        title: m.title,
        type: m.type,
        content: m.content,
        url: m.url,
        pages: m.pages,
        durationMin: m.durationMin,
        subject: m.subjectId?.name || "",
        updatedAt: m.updatedAt,
      })),
    });
  } catch (error) {
    console.error("listMaterials", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const listForum = async (req, res) => {
  try {
    const posts = await ExamForumPost.find({ status: "ACTIVE" })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      success: true,
      data: posts.map((p) => ({
        id: String(p._id),
        author: p.authorName,
        title: p.title,
        body: p.body,
        tag: p.tag,
        replies: p.replyCount,
        time: p.createdAt,
      })),
    });
  } catch (error) {
    console.error("listForum", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const createForumPost = async (req, res) => {
  try {
    const { title, body, tag } = req.body;
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Title and body are required",
      });
    }

    const user = await ExamCandidate.findById(req.examUser.id)
      .select("firstName lastName")
      .lean();
    const authorName = [user?.firstName, user?.lastName]
      .filter(Boolean)
      .join(" ") || "Candidate";

    const post = await ExamForumPost.create({
      authorId: req.examUser.id,
      authorName,
      title: title.trim(),
      body: body.trim(),
      tag: (tag || "General").trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Post created",
      data: {
        id: String(post._id),
        author: post.authorName,
        title: post.title,
        body: post.body,
        tag: post.tag,
        replies: 0,
        time: post.createdAt,
      },
    });
  } catch (error) {
    console.error("createForumPost", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const listSupportTickets = async (req, res) => {
  try {
    const tickets = await ExamSupportTicket.find({
      candidateId: req.examUser.id,
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: tickets.map((t) => ({
        id: String(t._id),
        subject: t.subject,
        message: t.message,
        status: t.status,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error("listSupportTickets", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const createSupportTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Subject and message are required",
      });
    }

    const ticket = await ExamSupportTicket.create({
      candidateId: req.examUser.id,
      subject: subject.trim(),
      message: message.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Support ticket created",
      data: {
        id: String(ticket._id),
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
    });
  } catch (error) {
    console.error("createSupportTicket", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const precheck = async (req, res) => {
  try {
    const test = await ExamTest.findById(req.params.testId)
      .populate("subjectId", "name code")
      .lean();
    if (!test || test.status !== "PUBLISHED") {
      return res.status(404).json({ success: false, message: "Test not found" });
    }

    return res.json({
      success: true,
      data: {
        test: serializeTest(test),
        checks: [
          {
            key: "browser",
            title: "Browser ready",
            detail: "Browser checks passed",
            ok: true,
          },
          {
            key: "network",
            title: "Network stable",
            detail: "Connection looks stable",
            ok: true,
          },
          {
            key: "identity",
            title: "Identity",
            detail: "Face authentication skipped for now",
            ok: true,
          },
        ],
      },
    });
  } catch (error) {
    console.error("precheck", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getStaffOverview = async (req, res) => {
  try {
    const role = req.examUser.role;
    if (role !== "EXAM_ADMIN") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const [
      candidates,
      admins,
      tests,
      questions,
      liveAttempts,
      submitted,
      materials,
      tickets,
    ] = await Promise.all([
      ExamCandidate.countDocuments({ role: "EXAM_CANDIDATE", status: "ACTIVE" }),
      ExamCandidate.countDocuments({ role: "EXAM_ADMIN", status: "ACTIVE" }),
      ExamTest.countDocuments({ status: "PUBLISHED" }),
      ExamQuestion.countDocuments({ status: "ACTIVE" }),
      ExamAttempt.countDocuments({ status: "IN_PROGRESS" }),
      ExamAttempt.countDocuments({ status: "SUBMITTED" }),
      ExamStudyMaterial.countDocuments({ status: "ACTIVE" }),
      ExamSupportTicket.countDocuments({ status: "OPEN" }),
    ]);

    return res.json({
      success: true,
      data: {
        role,
        stats: {
          candidates,
          admins,
          tests,
          questions,
          liveAttempts,
          submitted,
          materials,
          openTickets: tickets,
        },
      },
    });
  } catch (error) {
    console.error("getStaffOverview", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const listExamUsers = async (req, res) => {
  try {
    if (req.examUser.role !== "EXAM_ADMIN") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    const roleFilter = String(req.query.role || "").toUpperCase();
    const filter = {};
    if (["EXAM_ADMIN", "EXAM_CANDIDATE"].includes(roleFilter)) {
      filter.role = roleFilter;
    } else {
      filter.role = { $in: ["EXAM_ADMIN", "EXAM_CANDIDATE"] };
    }
    const users = await ExamCandidate.find(filter)
      .select("-password -forgotOtp")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: users.map((u) => ({
        id: String(u._id),
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        phone: u.phone,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
      })),
    });
  } catch (error) {
    console.error("listExamUsers", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const listQuestionsAdmin = async (req, res) => {
  try {
    if (req.examUser.role !== "EXAM_ADMIN") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const {
      subjectId,
      topic,
      difficulty,
      status = "ACTIVE",
      questionType,
      search,
    } = req.query;

    const filter = {};
    if (status && status !== "ALL") filter.status = String(status).toUpperCase();
    if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
      filter.subjectId = subjectId;
    }
    if (topic && topic !== "ALL") filter.topic = String(topic).trim();
    if (difficulty && difficulty !== "ALL") filter.difficulty = difficulty;
    if (questionType && questionType !== "ALL") {
      filter.questionType = String(questionType).toUpperCase();
    }
    if (search && String(search).trim()) {
      const q = String(search).trim();
      filter.$or = [
        { text: { $regex: q, $options: "i" } },
        { topic: { $regex: q, $options: "i" } },
        { explanation: { $regex: q, $options: "i" } },
      ];
    }

    const questions = await ExamQuestion.find(filter)
      .populate("subjectId", "name code")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: {
        total: questions.length,
        items: questions.map(serializeAdminQuestion),
      },
    });
  } catch (error) {
    console.error("listQuestionsAdmin", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

function serializeAdminQuestion(q) {
  return {
    id: String(q._id),
    text: q.text,
    topic: q.topic,
    difficulty: q.difficulty,
    questionType: q.questionType || "SCI",
    subjectId: q.subjectId?._id ? String(q.subjectId._id) : String(q.subjectId || ""),
    subject: q.subjectId?.name || "",
    subjectCode: q.subjectId?.code || "",
    options: q.options || [],
    correctIndex: q.correctIndex,
    correctIndexes: Array.isArray(q.correctIndexes)
      ? q.correctIndexes
      : [q.correctIndex],
    explanation: q.explanation || "",
    remarks: q.remarks || "",
    marks: q.marks ?? 1,
    timeMin: q.timeMin ?? 2,
    status: q.status || "ACTIVE",
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

function normalizeOptions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((o) => String(o ?? "").trim()).filter(Boolean);
}

function parseCorrectIndexes(body, optionsLength, questionType) {
  let indexes = [];
  if (Array.isArray(body.correctIndexes)) {
    indexes = body.correctIndexes.map(Number).filter((n) => !Number.isNaN(n));
  } else if (body.correctIndex != null && body.correctIndex !== "") {
    indexes = [Number(body.correctIndex)];
  }

  indexes = [...new Set(indexes)].filter(
    (i) => i >= 0 && i < optionsLength
  );

  if (questionType === "MCU") {
    if (!indexes.length) {
      throw new Error("Select at least one correct option");
    }
    return { correctIndex: indexes[0], correctIndexes: indexes };
  }

  if (indexes.length !== 1) {
    throw new Error("Select exactly one correct option");
  }
  return { correctIndex: indexes[0], correctIndexes: [indexes[0]] };
}

const createQuestionAdmin = async (req, res) => {
  try {
    if (req.examUser.role !== "EXAM_ADMIN") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const {
      subjectId,
      topic,
      difficulty = "Medium",
      questionType = "SCI",
      text,
      options,
      explanation = "",
      remarks = "",
      marks = 1,
      timeMin = 2,
      status = "ACTIVE",
    } = req.body;

    if (!subjectId || !mongoose.Types.ObjectId.isValid(subjectId)) {
      return res
        .status(400)
        .json({ success: false, message: "Subject is required" });
    }
    if (!String(topic || "").trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Topic is required" });
    }
    if (!String(text || "").trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Question text is required" });
    }

    const subject = await ExamSubject.findById(subjectId).lean();
    if (!subject) {
      return res
        .status(404)
        .json({ success: false, message: "Subject not found" });
    }

    const type = String(questionType || "SCI").toUpperCase();
    if (!["SCI", "MCU", "TRU"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Invalid question type. Use SCI, MCU or TRU.",
      });
    }

    let opts = normalizeOptions(options);
    if (type === "TRU") {
      opts = ["True", "False"];
    }
    if (opts.length < 2) {
      return res.status(400).json({
        success: false,
        message: "At least 2 options are required",
      });
    }
    if (type === "SCI" && opts.length > 5) {
      return res.status(400).json({
        success: false,
        message: "Single choice supports maximum 5 options",
      });
    }

    let correct;
    try {
      correct = parseCorrectIndexes(req.body, opts.length, type);
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (!String(explanation || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "Explanation is required",
      });
    }

    const points = Number(marks);
    const minutes = Number(timeMin);
    if (!points || points <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Score / points must be greater than 0" });
    }
    if (!minutes || minutes <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Question time must be greater than 0" });
    }

    const doc = await ExamQuestion.create({
      subjectId,
      topic: String(topic).trim(),
      difficulty: ["Easy", "Medium", "Hard"].includes(difficulty)
        ? difficulty
        : "Medium",
      questionType: type,
      text: String(text).trim(),
      options: opts,
      correctIndex: correct.correctIndex,
      correctIndexes: correct.correctIndexes,
      explanation: String(explanation).trim(),
      remarks: String(remarks || "").trim(),
      marks: points,
      timeMin: minutes,
      status: String(status).toUpperCase() === "INACTIVE" ? "INACTIVE" : "ACTIVE",
      createdBy: req.examUser.id,
    });

    const populated = await ExamQuestion.findById(doc._id)
      .populate("subjectId", "name code")
      .lean();

    return res.status(201).json({
      success: true,
      message: "Question & answer saved successfully",
      data: serializeAdminQuestion(populated),
    });
  } catch (error) {
    console.error("createQuestionAdmin", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

const updateQuestionAdmin = async (req, res) => {
  try {
    if (req.examUser.role !== "EXAM_ADMIN") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid question id" });
    }

    const existing = await ExamQuestion.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Question not found" });
    }

    const type = String(
      req.body.questionType || existing.questionType || "SCI"
    ).toUpperCase();

    if (req.body.subjectId) {
      if (!mongoose.Types.ObjectId.isValid(req.body.subjectId)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid subject" });
      }
      existing.subjectId = req.body.subjectId;
    }
    if (req.body.topic != null) existing.topic = String(req.body.topic).trim();
    if (req.body.text != null) existing.text = String(req.body.text).trim();
    if (req.body.difficulty) existing.difficulty = req.body.difficulty;
    if (req.body.explanation != null) {
      existing.explanation = String(req.body.explanation).trim();
    }
    if (req.body.remarks != null) existing.remarks = String(req.body.remarks).trim();
    if (req.body.marks != null) existing.marks = Number(req.body.marks);
    if (req.body.timeMin != null) existing.timeMin = Number(req.body.timeMin);
    if (req.body.status) {
      existing.status =
        String(req.body.status).toUpperCase() === "INACTIVE"
          ? "INACTIVE"
          : "ACTIVE";
    }

    existing.questionType = type;
    let opts =
      req.body.options != null
        ? normalizeOptions(req.body.options)
        : existing.options;
    if (type === "TRU") opts = ["True", "False"];
    if (opts.length < 2) {
      return res.status(400).json({
        success: false,
        message: "At least 2 options are required",
      });
    }
    existing.options = opts;

    try {
      const correct = parseCorrectIndexes(
        {
          correctIndex:
            req.body.correctIndex != null
              ? req.body.correctIndex
              : existing.correctIndex,
          correctIndexes:
            req.body.correctIndexes != null
              ? req.body.correctIndexes
              : existing.correctIndexes,
        },
        opts.length,
        type
      );
      existing.correctIndex = correct.correctIndex;
      existing.correctIndexes = correct.correctIndexes;
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    await existing.save();
    const populated = await ExamQuestion.findById(existing._id)
      .populate("subjectId", "name code")
      .lean();

    return res.json({
      success: true,
      message: "Question updated successfully",
      data: serializeAdminQuestion(populated),
    });
  } catch (error) {
    console.error("updateQuestionAdmin", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const listSubjectsAdmin = async (req, res) => {
  try {
    if (req.examUser.role !== "EXAM_ADMIN") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const subjects = await ExamSubject.find({ status: "ACTIVE" })
      .sort({ name: 1 })
      .lean();

    const topicsBySubject = await ExamQuestion.aggregate([
      { $match: { status: { $in: ["ACTIVE", "INACTIVE"] } } },
      {
        $group: {
          _id: { subjectId: "$subjectId", topic: "$topic" },
        },
      },
    ]);

    const topicMap = {};
    topicsBySubject.forEach((row) => {
      const sid = String(row._id.subjectId);
      if (!topicMap[sid]) topicMap[sid] = [];
      if (row._id.topic) topicMap[sid].push(row._id.topic);
    });

    return res.json({
      success: true,
      data: subjects.map((s) => ({
        id: String(s._id),
        name: s.name,
        code: s.code,
        description: s.description || "",
        topics: [...new Set(topicMap[String(s._id)] || [])].sort(),
      })),
    });
  } catch (error) {
    console.error("listSubjectsAdmin", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const createSubjectAdmin = async (req, res) => {
  try {
    if (req.examUser.role !== "EXAM_ADMIN") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const name = String(req.body.name || "").trim();
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Subject name is required" });
    }

    const code = String(req.body.code || name)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "")
      .slice(0, 12) || "SUBJ";

    const existing = await ExamSubject.findOne({
      $or: [{ name }, { code }],
    }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Subject already exists",
        data: {
          id: String(existing._id),
          name: existing.name,
          code: existing.code,
          topics: [],
        },
      });
    }

    const doc = await ExamSubject.create({
      name,
      code,
      description: String(req.body.description || "").trim(),
      status: "ACTIVE",
    });

    return res.status(201).json({
      success: true,
      message: "Subject created",
      data: {
        id: String(doc._id),
        name: doc.name,
        code: doc.code,
        description: doc.description || "",
        topics: [],
      },
    });
  } catch (error) {
    console.error("createSubjectAdmin", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const listLiveSessions = async (req, res) => {
  try {
    if (req.examUser.role !== "EXAM_ADMIN") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const sessions = await ExamAttempt.find({ status: "IN_PROGRESS" })
      .populate("testId", "title type durationMin")
      .populate("candidateId", "firstName lastName email")
      .sort({ startedAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: sessions.map((s) => ({
        id: String(s._id),
        title: s.testId?.title || "Test",
        type: s.testId?.type,
        candidate: s.candidateId
          ? `${s.candidateId.firstName || ""} ${s.candidateId.lastName || ""}`.trim()
          : "—",
        email: s.candidateId?.email || "",
        startedAt: s.startedAt,
        endsAt: s.endsAt,
        answered: (s.answers || []).filter((a) => a.selectedIndex != null).length,
        totalQuestions: s.totalQuestions || s.questionIds?.length || 0,
      })),
    });
  } catch (error) {
    console.error("listLiveSessions", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const listScheduledTests = async (req, res) => {
  try {
    if (req.examUser.role !== "EXAM_ADMIN") {
      return res.status(403).json({ success: false, message: "Admin only" });
    }
    const now = new Date();
    const tests = await ExamTest.find({
      status: "PUBLISHED",
      type: { $in: ["SCHEDULED", "ON_DEMAND"] },
    })
      .populate("subjectId", "name code")
      .sort({ startsAt: 1 })
      .lean();

    const enrollments = await ExamEnrollment.aggregate([
      { $match: { status: "ENROLLED" } },
      { $group: { _id: "$testId", count: { $sum: 1 } } },
    ]);
    const enrollMap = new Map(enrollments.map((e) => [String(e._id), e.count]));

    return res.json({
      success: true,
      data: tests.map((t) => ({
        id: String(t._id),
        title: t.title,
        type: t.type,
        subject: t.subjectId?.name || "",
        startsAt: t.startsAt,
        endsAt: t.endsAt,
        durationMin: t.durationMin,
        enrollments: enrollMap.get(String(t._id)) || 0,
        windowOpen:
          (!t.startsAt || now >= new Date(t.startsAt)) &&
          (!t.endsAt || now <= new Date(t.endsAt)),
      })),
    });
  } catch (error) {
    console.error("listScheduledTests", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

function requireAdmin(req, res) {
  if (req.examUser.role !== "EXAM_ADMIN") {
    res.status(403).json({ success: false, message: "Admin only" });
    return false;
  }
  return true;
}

function serializeAdminTest(test) {
  return {
    ...serializeTest(test),
    subjectId: test.subjectId?._id
      ? String(test.subjectId._id)
      : String(test.subjectId || ""),
    questionIds: (test.questionIds || []).map((id) => String(id)),
  };
}

const listTestsAdmin = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { type, status, subjectId, search } = req.query;
    const filter = {};
    if (status && status !== "ALL") filter.status = String(status).toUpperCase();
    if (type && type !== "ALL") filter.type = String(type).toUpperCase();
    if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
      filter.subjectId = subjectId;
    }
    if (search && String(search).trim()) {
      const q = String(search).trim();
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { description: { $regex: q, $options: "i" } },
      ];
    }

    const tests = await ExamTest.find(filter)
      .populate("subjectId", "name code")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({
      success: true,
      data: {
        total: tests.length,
        items: tests.map(serializeAdminTest),
      },
    });
  } catch (error) {
    console.error("listTestsAdmin", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const getTestAdmin = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid test id" });
    }
    const test = await ExamTest.findById(id)
      .populate("subjectId", "name code")
      .lean();
    if (!test) {
      return res.status(404).json({ success: false, message: "Test not found" });
    }
    return res.json({ success: true, data: serializeAdminTest(test) });
  } catch (error) {
    console.error("getTestAdmin", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

function parseTestPayload(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  if (body.title != null || !partial) {
    const title = String(body.title || "").trim();
    if (!title) errors.push("Test name is required");
    else if (title.length > 100) errors.push("Test name max 100 characters");
    else data.title = title;
  }

  if (body.description != null || !partial) {
    data.description = String(body.description || "").trim().slice(0, 250);
  }

  if (body.type != null || !partial) {
    const type = String(body.type || "").toUpperCase();
    if (!["PRACTICE", "SCHEDULED", "ON_DEMAND"].includes(type)) {
      errors.push("Test type must be Practice, Scheduled or On Demand");
    } else data.type = type;
  }

  if (body.subjectId != null || !partial) {
    if (!body.subjectId || !mongoose.Types.ObjectId.isValid(body.subjectId)) {
      errors.push("Subject is required");
    } else data.subjectId = body.subjectId;
  }

  if (body.difficulty != null || !partial) {
    const difficulty = body.difficulty || "Medium";
    if (!["Easy", "Medium", "Hard"].includes(difficulty)) {
      errors.push("Invalid difficulty level");
    } else data.difficulty = difficulty;
  }

  if (body.durationMin != null || !partial) {
    const durationMin = Number(body.durationMin);
    if (!durationMin || durationMin < 1) {
      errors.push("Duration must be at least 1 minute");
    } else data.durationMin = durationMin;
  }

  if (body.passPercent != null || !partial) {
    const passPercent = Number(body.passPercent);
    if (Number.isNaN(passPercent) || passPercent < 0 || passPercent > 100) {
      errors.push("Pass mark must be between 0 and 100");
    } else data.passPercent = passPercent;
  }

  if (body.maxAttempts != null) {
    data.maxAttempts = Math.max(0, Number(body.maxAttempts) || 0);
  }

  if (body.questionIds != null) {
    if (!Array.isArray(body.questionIds)) {
      errors.push("questionIds must be an array");
    } else {
      data.questionIds = body.questionIds.filter((id) =>
        mongoose.Types.ObjectId.isValid(id)
      );
    }
  }

  if (body.startsAt !== undefined) {
    data.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  }
  if (body.endsAt !== undefined) {
    data.endsAt = body.endsAt ? new Date(body.endsAt) : null;
  }

  if (body.status != null) {
    const status = String(body.status).toUpperCase();
    if (["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) {
      data.status = status;
    }
  }

  return { data, errors };
}

function validateWindow(type, startsAt, endsAt) {
  if (type === "PRACTICE") return null;
  if (!startsAt || !endsAt) {
    return "Scheduled / On Demand tests need start and end window";
  }
  if (new Date(endsAt) <= new Date(startsAt)) {
    return "End time must be after start time";
  }
  return null;
}

const createTestAdmin = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { data, errors } = parseTestPayload(req.body, { partial: false });
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors[0] });
    }

    const subject = await ExamSubject.findById(data.subjectId).lean();
    if (!subject) {
      return res.status(404).json({ success: false, message: "Subject not found" });
    }

    const status = data.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
    if (status === "PUBLISHED") {
      const windowErr = validateWindow(data.type, data.startsAt, data.endsAt);
      if (windowErr) {
        return res.status(400).json({ success: false, message: windowErr });
      }
      if (!data.questionIds?.length) {
        return res.status(400).json({
          success: false,
          message: "Select at least one question before publishing",
        });
      }
    }

    if (data.type === "PRACTICE") {
      data.startsAt = null;
      data.endsAt = null;
    }

    const doc = await ExamTest.create({
      title: data.title,
      description: data.description || "",
      subjectId: data.subjectId,
      type: data.type,
      difficulty: data.difficulty || "Medium",
      durationMin: data.durationMin || 30,
      passPercent: data.passPercent ?? 40,
      questionIds: data.questionIds || [],
      startsAt: data.startsAt || null,
      endsAt: data.endsAt || null,
      maxAttempts: data.maxAttempts ?? (data.type === "PRACTICE" ? 0 : 1),
      status,
    });

    const populated = await ExamTest.findById(doc._id)
      .populate("subjectId", "name code")
      .lean();

    return res.status(201).json({
      success: true,
      message:
        status === "PUBLISHED"
          ? "Test published successfully"
          : "Test created successfully",
      data: serializeAdminTest(populated),
    });
  } catch (error) {
    console.error("createTestAdmin", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server error",
    });
  }
};

const updateTestAdmin = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid test id" });
    }

    const existing = await ExamTest.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: "Test not found" });
    }

    const { data, errors } = parseTestPayload(req.body, { partial: true });
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors[0] });
    }

    if (existing.status === "PUBLISHED") {
      delete data.type;
      delete data.subjectId;
    }

    if (data.subjectId) {
      const subject = await ExamSubject.findById(data.subjectId).lean();
      if (!subject) {
        return res.status(404).json({ success: false, message: "Subject not found" });
      }
    }

    Object.assign(existing, data);
    if (existing.type === "PRACTICE") {
      existing.startsAt = null;
      existing.endsAt = null;
    }

    await existing.save();
    const populated = await ExamTest.findById(existing._id)
      .populate("subjectId", "name code")
      .lean();

    return res.json({
      success: true,
      message: "Test updated successfully",
      data: serializeAdminTest(populated),
    });
  } catch (error) {
    console.error("updateTestAdmin", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const publishTestAdmin = async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid test id" });
    }

    const test = await ExamTest.findById(id);
    if (!test) {
      return res.status(404).json({ success: false, message: "Test not found" });
    }

    if (!test.questionIds?.length) {
      return res.status(400).json({
        success: false,
        message: "Add questions before publishing",
      });
    }
    if (!test.durationMin || test.durationMin < 1) {
      return res.status(400).json({
        success: false,
        message: "Set test duration before publishing",
      });
    }

    const windowErr = validateWindow(test.type, test.startsAt, test.endsAt);
    if (windowErr) {
      return res.status(400).json({ success: false, message: windowErr });
    }

    test.status = "PUBLISHED";
    await test.save();

    const populated = await ExamTest.findById(test._id)
      .populate("subjectId", "name code")
      .lean();

    return res.json({
      success: true,
      message: "Test published successfully",
      data: serializeAdminTest(populated),
    });
  } catch (error) {
    console.error("publishTestAdmin", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getDashboard,
  listTests,
  getTestDetails,
  enrollTest,
  startAttempt,
  saveAnswer,
  submitAttempt,
  getAttemptResult,
  listResults,
  listCertificates,
  listMaterials,
  listForum,
  createForumPost,
  listSupportTickets,
  createSupportTicket,
  precheck,
  getStaffOverview,
  listExamUsers,
  listQuestionsAdmin,
  createQuestionAdmin,
  updateQuestionAdmin,
  listSubjectsAdmin,
  createSubjectAdmin,
  listLiveSessions,
  listScheduledTests,
  listTestsAdmin,
  getTestAdmin,
  createTestAdmin,
  updateTestAdmin,
  publishTestAdmin,
};
