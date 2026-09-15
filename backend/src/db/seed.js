require("dotenv").config();

const bcrypt = require("bcryptjs");
const { pool } = require("./pool");

async function getOrCreateUser(email, password, role, fullName, phone) {
  const found = await pool.query("SELECT id FROM users WHERE email=$1", [
    email,
  ]);

  if (found.rows.length) {
    return found.rows[0].id;
  }

  const hash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `INSERT INTO users
      (email, password_hash, role, full_name, phone)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING id`,
    [email, hash, role, fullName, phone],
  );

  return result.rows[0].id;
}

async function getOrCreateSubject(name, code) {
  const found = await pool.query("SELECT id FROM subjects WHERE name=$1", [
    name,
  ]);

  if (found.rows.length) {
    return found.rows[0].id;
  }

  const result = await pool.query(
    `INSERT INTO subjects (name, code)
     VALUES ($1,$2)
     RETURNING id`,
    [name, code],
  );

  return result.rows[0].id;
}

async function getOrCreateStudent(
  rollNumber,
  dob,
  gender,
  address,
  guardianName,
  guardianPhone,
) {
  const found = await pool.query(
    "SELECT id FROM students WHERE roll_number=$1",
    [rollNumber],
  );

  if (found.rows.length) {
    return found.rows[0].id;
  }

  const result = await pool.query(
    `INSERT INTO students
      (roll_number, dob, gender, address, guardian_name, guardian_phone)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [rollNumber, dob, gender, address, guardianName, guardianPhone],
  );

  return result.rows[0].id;
}

async function getOrCreateClassSlot(
  subjectId,
  teacherId,
  startTime,
  endTime,
  days,
  room,
  academicYear,
) {
  const found = await pool.query(
    `SELECT id
     FROM class_slots
     WHERE subject_id=$1
       AND teacher_id=$2
       AND start_time=$3
       AND end_time=$4
       AND days=$5
       AND academic_year=$6`,
    [subjectId, teacherId, startTime, endTime, days, academicYear],
  );

  if (found.rows.length) {
    return found.rows[0].id;
  }

  const result = await pool.query(
    `INSERT INTO class_slots
      (
        subject_id,
        teacher_id,
        start_time,
        end_time,
        days,
        room,
        academic_year
      )
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [subjectId, teacherId, startTime, endTime, days, room, academicYear],
  );

  return result.rows[0].id;
}

async function enrollStudent(studentId, classSlotId) {
  await pool.query(
    `INSERT INTO student_enrollments
      (student_id, class_slot_id)
     VALUES ($1,$2)
     ON CONFLICT (student_id, class_slot_id)
     DO NOTHING`,
    [studentId, classSlotId],
  );
}

async function createFee(
  studentId,
  totalAmount,
  paidAmount,
  academicYear,
  description
) {
  const total = Number(totalAmount);
  const paid = Number(paidAmount);
  const due = total - paid;

  let status = "pending";

  if (paid >= total) {
    status = "paid";
  } else if (paid > 0) {
    status = "partial";
  }

  const paymentDate = paid > 0 ? new Date() : null;

  await pool.query(
    `INSERT INTO fees
      (
        student_id,
        total_amount,
        paid_amount,
        due_amount,
        status,
        payment_date,
        receipt_number,
        academic_year,
        description
      )
     VALUES
      (
        $1::integer,
        $2::numeric,
        $3::numeric,
        $4::numeric,
        $5::varchar,
        $6::date,
        $7::varchar,
        $8::varchar,
        $9::text
      )
     ON CONFLICT DO NOTHING`,
    [
      studentId,
      total,
      paid,
      due,
      status,
      paymentDate,
      null,
      academicYear,
      description,
    ]
  );
}

(async () => {
  try {
    console.log("Starting clean database seed...");

    // ============================================================
    // USERS
    // ============================================================

    const adminEmail = process.env.ADMIN_EMAIL || "admin@sabawoon.local";

    const adminPassword = process.env.ADMIN_PASSWORD || "Admin@12345";

    const adminName = process.env.ADMIN_NAME || "System Administrator";

    const adminId = await getOrCreateUser(
      adminEmail,
      adminPassword,
      "admin",
      adminName,
      "+93700000001",
    );

    console.log(`Admin ready: ${adminEmail}`);

    const staffId = await getOrCreateUser(
      "staff@sabawoon.local",
      "Staff@12345",
      "staff",
      "Office Staff",
      "+93700000002",
    );

    const teacher1Id = await getOrCreateUser(
      "teacher@sabawoon.local",
      "Teacher@12345",
      "teacher",
      "Ahmad Teacher",
      "+93700000003",
    );

    const teacher2Id = await getOrCreateUser(
      "teacher2@sabawoon.local",
      "Teacher@12345",
      "teacher",
      "Mohammad Teacher",
      "+93700000004",
    );

    // ============================================================
    // TEACHER RECORDS
    // ============================================================

    await pool.query(
      `INSERT INTO teachers
        (
          user_id,
          employee_id,
          qualification,
          specialization,
          salary
        )
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id)
       DO NOTHING`,
      [teacher1Id, "EMP001", "B.Sc", "Computer Science", 50000],
    );

    await pool.query(
      `INSERT INTO teachers
        (
          user_id,
          employee_id,
          qualification,
          specialization,
          salary
        )
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id)
       DO NOTHING`,
      [teacher2Id, "EMP002", "B.A", "English", 45000],
    );

    // ============================================================
    // SUBJECTS
    // ============================================================

    const englishId = await getOrCreateSubject("English", "ENG");

    const quranId = await getOrCreateSubject("Quran", "QUR");

    const computerId = await getOrCreateSubject("Computer", "CMP");

    const mathematicsId = await getOrCreateSubject("Mathematics", "MAT");

    // ============================================================
    // CLASS SLOTS
    //
    // Subject → Time → Teacher
    // ============================================================

    const academicYear = "2026-2027";

    const englishSlot = await getOrCreateClassSlot(
      englishId,
      teacher2Id,
      "14:00",
      "15:00",
      "Monday,Wednesday,Friday",
      "Room 101",
      academicYear,
    );

    const quranSlot = await getOrCreateClassSlot(
      quranId,
      teacher1Id,
      "15:00",
      "16:00",
      "Monday,Wednesday,Friday",
      "Room 101",
      academicYear,
    );

    const computerSlot = await getOrCreateClassSlot(
      computerId,
      teacher1Id,
      "16:00",
      "17:00",
      "Monday,Wednesday,Friday",
      "Computer Lab",
      academicYear,
    );

    const mathematicsSlot = await getOrCreateClassSlot(
      mathematicsId,
      teacher2Id,
      "17:00",
      "18:00",
      "Tuesday,Thursday",
      "Room 102",
      academicYear,
    );

    // ============================================================
    // STUDENTS
    // ============================================================

    const students = [];

    students.push(
      await getOrCreateStudent(
        "STU001",
        "2008-01-15",
        "male",
        "Kabul, Afghanistan",
        "Student One Guardian",
        "+93701000001",
      ),
    );

    students.push(
      await getOrCreateStudent(
        "STU002",
        "2008-04-20",
        "male",
        "Kabul, Afghanistan",
        "Student Two Guardian",
        "+93701000002",
      ),
    );

    students.push(
      await getOrCreateStudent(
        "STU003",
        "2009-02-10",
        "female",
        "Kabul, Afghanistan",
        "Student Three Guardian",
        "+93701000003",
      ),
    );

    students.push(
      await getOrCreateStudent(
        "STU004",
        "2009-07-05",
        "male",
        "Kabul, Afghanistan",
        "Student Four Guardian",
        "+93701000004",
      ),
    );

    students.push(
      await getOrCreateStudent(
        "STU005",
        "2008-11-12",
        "female",
        "Kabul, Afghanistan",
        "Student Five Guardian",
        "+93701000005",
      ),
    );

    // ============================================================
    // ENROLLMENTS
    // ============================================================

    for (const studentId of students) {
      await enrollStudent(studentId, englishSlot);
      await enrollStudent(studentId, computerSlot);
    }

    // Give a few students additional subjects
    await enrollStudent(students[0], quranSlot);
    await enrollStudent(students[1], quranSlot);
    await enrollStudent(students[2], mathematicsSlot);
    await enrollStudent(students[3], mathematicsSlot);

    // ============================================================
    // SAMPLE FEES
    // ============================================================

    await createFee(
      students[0],
      5000,
      3000,
      academicYear,
      "Annual Tuition Fee",
    );

    await createFee(
      students[1],
      5000,
      5000,
      academicYear,
      "Annual Tuition Fee",
    );

    await createFee(
      students[2],
      5000,
      2000,
      academicYear,
      "Annual Tuition Fee",
    );

    await createFee(students[3], 5000, 0, academicYear, "Annual Tuition Fee");

    await createFee(
      students[4],
      5000,
      3500,
      academicYear,
      "Annual Tuition Fee",
    );

    console.log("");
    console.log("==========================================");
    console.log("Clean seed completed successfully.");
    console.log("==========================================");
    console.log("");
    console.log("Admin login:");
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log("");
    console.log("Staff login:");
    console.log("Email: staff@sabawoon.local");
    console.log("Password: Staff@12345");
    console.log("");
    console.log("Teacher login:");
    console.log("Email: teacher@sabawoon.local");
    console.log("Password: Teacher@12345");
    console.log("");
    console.log("Teacher 2 login:");
    console.log("Email: teacher2@sabawoon.local");
    console.log("Password: Teacher@12345");
    console.log("");

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error("");
    console.error("Seed failed:");
    console.error(error);
    console.error("");

    await pool.end();
    process.exit(1);
  }
})();
