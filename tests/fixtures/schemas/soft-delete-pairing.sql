CREATE TABLE "AuditLog" (
  id SERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE "Comment" (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  deleted_by TEXT
);

CREATE TABLE "Article" (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT
);

CREATE TABLE "Tag" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
