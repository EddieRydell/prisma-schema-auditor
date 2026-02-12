CREATE TABLE "User" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  "tagIds" TEXT NOT NULL,
  "roleList" TEXT NOT NULL,
  phone1 TEXT NOT NULL,
  phone2 TEXT NOT NULL,
  phone3 TEXT NOT NULL,
  metadata JSONB NOT NULL
);

CREATE TABLE "Product" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  "categoryIds" TEXT NOT NULL,
  address1 TEXT NOT NULL,
  address2 TEXT NOT NULL,
  attributes JSONB NOT NULL
);
