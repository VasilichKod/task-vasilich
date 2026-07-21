-- AlterTable
ALTER TABLE "projects"
ADD COLUMN "activity_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "last_activity_at" TIMESTAMP(3);

-- Existing projects start in their familiar order until real activity is recorded.
UPDATE "projects"
SET
    "activity_score" = GREATEST(1, 100 - "sort_order"),
    "last_activity_at" = "updated_at"
WHERE "archived_at" IS NULL;

-- CreateIndex
CREATE INDEX "projects_workspace_id_last_activity_at_idx"
ON "projects"("workspace_id", "last_activity_at");
