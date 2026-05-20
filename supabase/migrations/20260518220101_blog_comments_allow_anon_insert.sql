-- ============================================================
-- VARS — Migration: blog_comments_allow_anon_insert
-- Allows anonymous users to submit comments (auto-approved).
-- ============================================================

CREATE POLICY "allow anon insert"
  ON blog_comments FOR INSERT
  WITH CHECK (approved = TRUE);
