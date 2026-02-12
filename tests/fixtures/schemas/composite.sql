CREATE TABLE "Post" (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE "Tag" (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE "PostTag" (
  "postId" INT NOT NULL,
  "tagId" INT NOT NULL,
  PRIMARY KEY ("postId", "tagId"),
  CONSTRAINT fk_post FOREIGN KEY ("postId") REFERENCES "Post"(id),
  CONSTRAINT fk_tag FOREIGN KEY ("tagId") REFERENCES "Tag"(id)
);
