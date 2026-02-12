CREATE TABLE "User" (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT
);

CREATE TABLE "Post" (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  published BOOLEAN NOT NULL DEFAULT false,
  "authorId" INT NOT NULL,
  CONSTRAINT fk_author FOREIGN KEY ("authorId") REFERENCES "User"(id)
);

CREATE INDEX idx_post_author ON "Post" ("authorId");
