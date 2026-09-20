/**
 * Seed examination portal content so candidates can run a full flow.
 * Usage: node scripts/seedExamPortal.js
 */
require("dotenv").config();
const mongoose = require("mongoose");

const ExamSubject = require("../models/ExamSubject.model");
const ExamQuestion = require("../models/ExamQuestion.model");
const ExamTest = require("../models/ExamTest.model");
const ExamStudyMaterial = require("../models/ExamStudyMaterial.model");
const ExamForumPost = require("../models/ExamForumPost.model");

const SUBJECTS = [
  { name: "Mathematics", code: "MATH", description: "Algebra, arithmetic and problem solving" },
  { name: "Physics", code: "PHY", description: "Mechanics and basic physics concepts" },
  { name: "Chemistry", code: "CHEM", description: "Elements, compounds and reactions" },
  { name: "English", code: "ENG", description: "Grammar and comprehension" },
];

const QUESTIONS = {
  MATH: [
    { topic: "Algebra", difficulty: "Easy", text: "What is the derivative of x²?", options: ["x", "2x", "x²", "2"], correctIndex: 1, explanation: "d/dx(x²) = 2x" },
    { topic: "Arithmetic", difficulty: "Easy", text: "Square root of 144 is:", options: ["10", "11", "12", "14"], correctIndex: 2, explanation: "12 × 12 = 144" },
    { topic: "Algebra", difficulty: "Medium", text: "Solve: 2x + 6 = 14. x = ?", options: ["2", "4", "6", "8"], correctIndex: 1, explanation: "2x = 8 → x = 4" },
    { topic: "Geometry", difficulty: "Medium", text: "Area of a circle with radius 7 (π=22/7) is:", options: ["154", "144", "164", "44"], correctIndex: 0, explanation: "πr² = 22/7 × 49 = 154" },
    { topic: "Algebra", difficulty: "Hard", text: "If f(x)=3x−1, f(5)=?", options: ["14", "15", "16", "12"], correctIndex: 0, explanation: "3×5−1=14" },
  ],
  PHY: [
    { topic: "Laws", difficulty: "Easy", text: "Every action has an equal and opposite reaction. This is:", options: ["Newton's 1st Law", "Newton's 2nd Law", "Newton's 3rd Law", "Ohm's Law"], correctIndex: 2, explanation: "Newton's third law" },
    { topic: "Motion", difficulty: "Easy", text: "SI unit of force is:", options: ["Joule", "Newton", "Watt", "Pascal"], correctIndex: 1, explanation: "Force is measured in Newtons" },
    { topic: "Motion", difficulty: "Medium", text: "Speed = distance / ?", options: ["Mass", "Time", "Force", "Energy"], correctIndex: 1, explanation: "v = d/t" },
    { topic: "Energy", difficulty: "Medium", text: "Unit of energy is:", options: ["Newton", "Joule", "Ampere", "Volt"], correctIndex: 1, explanation: "Energy is measured in Joules" },
    { topic: "Light", difficulty: "Hard", text: "Light travels fastest in:", options: ["Water", "Glass", "Vacuum", "Air"], correctIndex: 2, explanation: "Vacuum has the highest speed of light" },
  ],
  CHEM: [
    { topic: "Elements", difficulty: "Easy", text: "Chemical symbol for Sodium is:", options: ["So", "Sd", "Na", "Sm"], correctIndex: 2, explanation: "Na from Natrium" },
    { topic: "Elements", difficulty: "Easy", text: "Water's chemical formula is:", options: ["CO2", "H2O", "O2", "NaCl"], correctIndex: 1, explanation: "H2O" },
    { topic: "Periodic", difficulty: "Medium", text: "Atomic number of Carbon is:", options: ["4", "6", "8", "12"], correctIndex: 1, explanation: "Carbon has 6 protons" },
    { topic: "Reactions", difficulty: "Medium", text: "pH of a neutral solution is:", options: ["0", "7", "14", "1"], correctIndex: 1, explanation: "Neutral pH is 7" },
    { topic: "Organic", difficulty: "Hard", text: "Methane formula is:", options: ["CH4", "C2H6", "C6H6", "CO"], correctIndex: 0, explanation: "CH4 is methane" },
  ],
  ENG: [
    { topic: "Grammar", difficulty: "Easy", text: "Choose the correct article: ___ apple", options: ["a", "an", "the", "no article"], correctIndex: 1, explanation: "'an' before vowel sound" },
    { topic: "Grammar", difficulty: "Easy", text: "Plural of 'child' is:", options: ["childs", "children", "childes", "child"], correctIndex: 1, explanation: "Irregular plural: children" },
    { topic: "Vocab", difficulty: "Medium", text: "Synonym of 'happy' is:", options: ["sad", "angry", "joyful", "tired"], correctIndex: 2, explanation: "joyful ≈ happy" },
    { topic: "Grammar", difficulty: "Medium", text: "She ___ to school every day.", options: ["go", "goes", "going", "gone"], correctIndex: 1, explanation: "Third person singular: goes" },
    { topic: "Comprehension", difficulty: "Hard", text: "Antonym of 'ancient' is:", options: ["old", "modern", "historic", "aged"], correctIndex: 1, explanation: "modern opposite of ancient" },
  ],
};

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected");

  await Promise.all([
    ExamQuestion.deleteMany({}),
    ExamTest.deleteMany({}),
    ExamStudyMaterial.deleteMany({}),
    ExamForumPost.deleteMany({}),
    ExamSubject.deleteMany({}),
  ]);

  const subjectDocs = {};
  for (const s of SUBJECTS) {
    subjectDocs[s.code] = await ExamSubject.create(s);
  }

  const questionIdsBySubject = {};
  for (const [code, list] of Object.entries(QUESTIONS)) {
    questionIdsBySubject[code] = [];
    for (const q of list) {
      const doc = await ExamQuestion.create({
        subjectId: subjectDocs[code]._id,
        ...q,
        marks: 1,
        status: "ACTIVE",
      });
      questionIdsBySubject[code].push(doc._id);
    }
  }

  const now = new Date();
  const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  await ExamTest.create([
    {
      title: "Algebra Fundamentals Mock",
      description: "Practice algebra basics",
      subjectId: subjectDocs.MATH._id,
      type: "PRACTICE",
      difficulty: "Easy",
      durationMin: 20,
      passPercent: 40,
      questionIds: questionIdsBySubject.MATH,
      maxAttempts: 0,
      status: "PUBLISHED",
    },
    {
      title: "Thermodynamics Practice",
      description: "Physics practice set",
      subjectId: subjectDocs.PHY._id,
      type: "PRACTICE",
      difficulty: "Medium",
      durationMin: 25,
      passPercent: 40,
      questionIds: questionIdsBySubject.PHY,
      maxAttempts: 0,
      status: "PUBLISHED",
    },
    {
      title: "Organic Chemistry Drill",
      description: "Chemistry practice",
      subjectId: subjectDocs.CHEM._id,
      type: "PRACTICE",
      difficulty: "Hard",
      durationMin: 25,
      passPercent: 40,
      questionIds: questionIdsBySubject.CHEM,
      maxAttempts: 0,
      status: "PUBLISHED",
    },
    {
      title: "English Comprehension Set A",
      description: "Grammar and vocabulary practice",
      subjectId: subjectDocs.ENG._id,
      type: "PRACTICE",
      difficulty: "Medium",
      durationMin: 20,
      passPercent: 40,
      questionIds: questionIdsBySubject.ENG,
      maxAttempts: 0,
      status: "PUBLISHED",
    },
    {
      title: "Semester Mid-Term — Mathematics",
      description: "Scheduled certification exam for Mathematics",
      subjectId: subjectDocs.MATH._id,
      type: "SCHEDULED",
      difficulty: "Medium",
      durationMin: 30,
      passPercent: 50,
      questionIds: questionIdsBySubject.MATH,
      startsAt: yesterday,
      endsAt: inSevenDays,
      maxAttempts: 2,
      status: "PUBLISHED",
    },
    {
      title: "Science Unit Test — Physics",
      description: "On-demand physics assessment",
      subjectId: subjectDocs.PHY._id,
      type: "ON_DEMAND",
      difficulty: "Medium",
      durationMin: 25,
      passPercent: 50,
      questionIds: questionIdsBySubject.PHY,
      startsAt: yesterday,
      endsAt: inTwoDays,
      maxAttempts: 3,
      status: "PUBLISHED",
    },
  ]);

  await ExamStudyMaterial.create([
    {
      title: "Quadratic Equations — Notes",
      subjectId: subjectDocs.MATH._id,
      type: "Document",
      content:
        "A quadratic equation is ax² + bx + c = 0. Discriminant D = b² − 4ac. Roots are (−b ± √D) / 2a.",
      pages: 8,
      status: "ACTIVE",
    },
    {
      title: "Laws of Motion — Summary",
      subjectId: subjectDocs.PHY._id,
      type: "Document",
      content:
        "1st Law: inertia. 2nd Law: F = ma. 3rd Law: action-reaction pairs.",
      pages: 6,
      status: "ACTIVE",
    },
    {
      title: "Periodic Table Basics",
      subjectId: subjectDocs.CHEM._id,
      type: "PDF",
      content: "Groups are columns; periods are rows. Atomic number increases left to right.",
      pages: 5,
      status: "ACTIVE",
    },
    {
      title: "Essay Writing Tips",
      subjectId: subjectDocs.ENG._id,
      type: "Document",
      content: "Introduction → body paragraphs with examples → conclusion. Keep one idea per paragraph.",
      pages: 4,
      status: "ACTIVE",
    },
  ]);

  await ExamForumPost.create({
    authorId: new mongoose.Types.ObjectId(),
    authorName: "Edvora Coach",
    title: "Welcome to the Examination forum",
    body: "Ask doubts about practice tests and scheduled exams here.",
    tag: "General",
    replyCount: 0,
  });

  console.log("✅ Exam portal seeded");
  console.log("Subjects:", SUBJECTS.length);
  console.log("Questions:", Object.values(QUESTIONS).flat().length);
  console.log("Tests: 4 practice + 1 scheduled + 1 on-demand");
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
