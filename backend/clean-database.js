const { query } = require("./src/db/pool");

const sql = `
  TRUNCATE TABLE
    submissions,
    assignments,
    marks,
    exams,
    attendance,
    fees,
    student_enrollments,
    students,
    timetable
  RESTART IDENTITY CASCADE
`;

query(sql)
  .then(() => console.log("DATABASE CLEANED SUCCESSFULLY"))
  .catch((err) => {
    console.error("CLEANUP FAILED:", err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
