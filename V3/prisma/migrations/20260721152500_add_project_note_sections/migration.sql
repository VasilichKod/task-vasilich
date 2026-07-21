-- CreateTable
CREATE TABLE "project_note_sections" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_note_sections_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "project_notes" ADD COLUMN "section_id" TEXT;

-- Preserve existing notes by placing them in a default section for their project.
INSERT INTO "project_note_sections" (
    "id", "workspace_id", "project_id", "name", "sort_order", "created_at", "updated_at"
)
SELECT DISTINCT
    'legacy_section_' || md5("project_id"),
    "workspace_id",
    "project_id",
    'Общее',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "project_notes";

UPDATE "project_notes"
SET "section_id" = 'legacy_section_' || md5("project_id")
WHERE "section_id" IS NULL;

-- Replace the old ordering index with the section-aware ordering index.
DROP INDEX "project_notes_workspace_id_project_id_sort_order_idx";
CREATE INDEX "project_notes_workspace_id_project_id_section_id_sort_order_idx"
ON "project_notes"("workspace_id", "project_id", "section_id", "sort_order");

CREATE INDEX "project_note_sections_workspace_id_project_id_sort_order_idx"
ON "project_note_sections"("workspace_id", "project_id", "sort_order");

-- AddForeignKey
ALTER TABLE "project_note_sections"
ADD CONSTRAINT "project_note_sections_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_note_sections"
ADD CONSTRAINT "project_note_sections_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_notes"
ADD CONSTRAINT "project_notes_section_id_fkey"
FOREIGN KEY ("section_id") REFERENCES "project_note_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
