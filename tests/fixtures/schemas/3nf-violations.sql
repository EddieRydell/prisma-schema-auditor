CREATE TABLE "Employee" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  "departmentId" INT NOT NULL,
  "deptName" TEXT NOT NULL,
  "deptLocation" TEXT NOT NULL,
  CONSTRAINT fk_department FOREIGN KEY ("departmentId") REFERENCES "Department"(id)
);

CREATE TABLE "Department" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL
);
