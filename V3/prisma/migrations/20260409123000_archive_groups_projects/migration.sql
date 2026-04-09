-- DropForeignKey
ALTER TABLE "achievement_page_projects" DROP CONSTRAINT "achievement_page_projects_group_id_fkey";

-- DropForeignKey
ALTER TABLE "achievement_page_projects" DROP CONSTRAINT "achievement_page_projects_project_id_fkey";

-- DropForeignKey
ALTER TABLE "achievements" DROP CONSTRAINT "achievements_project_id_fkey";

-- DropForeignKey
ALTER TABLE "day_projects" DROP CONSTRAINT "day_projects_group_id_fkey";

-- DropForeignKey
ALTER TABLE "project_templates" DROP CONSTRAINT "project_templates_group_id_fkey";

-- DropForeignKey
ALTER TABLE "task_page_projects" DROP CONSTRAINT "task_page_projects_group_id_fkey";

-- AlterTable
ALTER TABLE "achievement_page_projects" ADD COLUMN     "group_name_snapshot" TEXT NOT NULL,
ADD COLUMN     "project_name_snapshot" TEXT NOT NULL,
ALTER COLUMN "group_id" DROP NOT NULL,
ALTER COLUMN "project_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "achievements" ADD COLUMN     "group_name_snapshot" TEXT,
ADD COLUMN     "project_name_snapshot" TEXT NOT NULL,
ALTER COLUMN "project_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "delete_after_at" TIMESTAMP(3),
ADD COLUMN     "is_system" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "system_key" TEXT;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "delete_after_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "groups_workspace_id_system_key_key" ON "groups"("workspace_id", "system_key");

-- AddForeignKey
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_projects" ADD CONSTRAINT "day_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_page_projects" ADD CONSTRAINT "task_page_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_page_projects" ADD CONSTRAINT "achievement_page_projects_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievement_page_projects" ADD CONSTRAINT "achievement_page_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

