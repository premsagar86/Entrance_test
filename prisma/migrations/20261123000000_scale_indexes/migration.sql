-- Indexes for the 1000-student load (dashboard, results, cleanup, cascade deletes).
CREATE INDEX IF NOT EXISTS "attempts_student_id_idx" ON "attempts"("student_id");
CREATE INDEX IF NOT EXISTS "attempts_status_expires_at_idx" ON "attempts"("status", "expires_at");
CREATE INDEX IF NOT EXISTS "test_assignments_student_id_idx" ON "test_assignments"("student_id");
CREATE INDEX IF NOT EXISTS "answers_question_id_idx" ON "answers"("question_id");
CREATE INDEX IF NOT EXISTS "sessions_absolute_expires_at_idx" ON "sessions"("absolute_expires_at");
CREATE INDEX IF NOT EXISTS "rate_limits_window_start_idx" ON "rate_limits"("window_start");
