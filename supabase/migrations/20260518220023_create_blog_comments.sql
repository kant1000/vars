-- ============================================================
-- VARS — Migration: create_blog_comments
-- Blog comment storage for the Wide Awake blog.
-- ============================================================

CREATE TABLE IF NOT EXISTS blog_comments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  article_slug TEXT        NOT NULL,
  name         TEXT        NOT NULL,
  email        TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  approved     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE blog_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read approved comments"
  ON blog_comments FOR SELECT
  USING (approved = TRUE);
