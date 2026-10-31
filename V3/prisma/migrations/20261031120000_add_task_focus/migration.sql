ALTER TABLE "projects" ADD COLUMN "focus_area" TEXT NOT NULL DEFAULT 'unassigned';
ALTER TABLE "weekly_tasks"
  ADD COLUMN "focus_area" TEXT,
  ADD COLUMN "important" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "completed_at" TIMESTAMP(3);
ALTER TABLE "backlog_tasks"
  ADD COLUMN "focus_area" TEXT,
  ADD COLUMN "important" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "completed_at" TIMESTAMP(3);
ALTER TABLE "recurring_tasks"
  ADD COLUMN "focus_area" TEXT,
  ADD COLUMN "important" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "recurring_task_status" ADD COLUMN "completed_at" TIMESTAMP(3);
