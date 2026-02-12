CREATE TABLE "Student" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE "Course" (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE "Enrollment" (
  "studentId" INT NOT NULL,
  "courseId" INT NOT NULL,
  grade TEXT NOT NULL,
  "enrolledAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("studentId", "courseId"),
  CONSTRAINT fk_student FOREIGN KEY ("studentId") REFERENCES "Student"(id),
  CONSTRAINT fk_course FOREIGN KEY ("courseId") REFERENCES "Course"(id)
);

CREATE TABLE "Department" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE "Employee" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE "ProjectAssignment" (
  "departmentId" INT NOT NULL,
  "employeeId" INT NOT NULL,
  role TEXT NOT NULL,
  "startDate" TIMESTAMPTZ NOT NULL,
  PRIMARY KEY ("departmentId", "employeeId"),
  CONSTRAINT fk_department FOREIGN KEY ("departmentId") REFERENCES "Department"(id),
  CONSTRAINT fk_employee FOREIGN KEY ("employeeId") REFERENCES "Employee"(id)
);
