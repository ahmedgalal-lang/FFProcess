-- DropForeignKey
ALTER TABLE "process_step_links" DROP CONSTRAINT "process_step_links_targetProcessId_fkey";

-- AddForeignKey
ALTER TABLE "process_step_links" ADD CONSTRAINT "process_step_links_targetProcessId_fkey" FOREIGN KEY ("targetProcessId") REFERENCES "processes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
