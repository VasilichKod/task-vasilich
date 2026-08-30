ALTER TABLE "project_note_sections"
ADD COLUMN "source_system" TEXT,
ADD COLUMN "source_id" TEXT;

ALTER TABLE "project_notes"
ADD COLUMN "source_system" TEXT,
ADD COLUMN "source_id" TEXT;

CREATE UNIQUE INDEX "project_note_sections_source_key"
ON "project_note_sections"("workspace_id", "project_id", "source_system", "source_id");

CREATE UNIQUE INDEX "project_notes_source_key"
ON "project_notes"("workspace_id", "project_id", "source_system", "source_id");
