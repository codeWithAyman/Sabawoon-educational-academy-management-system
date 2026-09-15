const { query } = require("./src/db/pool");

Promise.all([
  query("SELECT COUNT(*) FROM users"),
  query("SELECT COUNT(*) FROM teachers"),
  query("SELECT COUNT(*) FROM subjects"),
  query("SELECT COUNT(*) FROM students"),
  query("SELECT COUNT(*) FROM class_slots"),
  query("SELECT COUNT(*) FROM student_enrollments"),
  query("SELECT COUNT(*) FROM fees"),
  query("SELECT COUNT(*) FROM attendance"),
  query("SELECT COUNT(*) FROM exams"),
  query("SELECT COUNT(*) FROM marks"),
  query("SELECT COUNT(*) FROM assignments")
])
.then(([u,t,s,st,c,e,f,a,x,m,as]) => {
  console.table({
    users: u.rows[0].count,
    teachers: t.rows[0].count,
    subjects: s.rows[0].count,
    students: st.rows[0].count,
    class_slots: c.rows[0].count,
    enrollments: e.rows[0].count,
    fees: f.rows[0].count,
    attendance: a.rows[0].count,
    exams: x.rows[0].count,
    marks: m.rows[0].count,
    assignments: as.rows[0].count
  });
})
.catch(console.error)
.finally(() => process.exit());
