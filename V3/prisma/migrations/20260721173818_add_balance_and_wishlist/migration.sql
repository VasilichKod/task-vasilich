-- CreateEnum
CREATE TYPE "WishItemStatus" AS ENUM ('IDEA', 'PLANNED', 'FULFILLED');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "balance_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "wish_lists" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wish_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wish_items" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "list_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "price_text" TEXT NOT NULL DEFAULT '',
    "status" "WishItemStatus" NOT NULL DEFAULT 'IDEA',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "fulfilled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wish_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wish_lists_workspace_id_sort_order_created_at_idx" ON "wish_lists"("workspace_id", "sort_order", "created_at");

-- CreateIndex
CREATE INDEX "wish_items_workspace_id_list_id_status_sort_order_idx" ON "wish_items"("workspace_id", "list_id", "status", "sort_order");

-- AddForeignKey
ALTER TABLE "wish_lists" ADD CONSTRAINT "wish_lists_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wish_items" ADD CONSTRAINT "wish_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "wish_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
