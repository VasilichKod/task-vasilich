-- CreateTable
CREATE TABLE "achievement_years" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "achievement_year" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "achievement_years_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "achievement_years_workspace_id_sort_order_achievement_year_idx" ON "achievement_years"("workspace_id", "sort_order", "achievement_year");

-- CreateIndex
CREATE UNIQUE INDEX "achievement_years_workspace_id_achievement_year_key" ON "achievement_years"("workspace_id", "achievement_year");

-- AddForeignKey
ALTER TABLE "achievement_years" ADD CONSTRAINT "achievement_years_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
