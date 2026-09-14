-- DropIndex
DROP INDEX "maintenance_request_technicians_maintenanceRequestId_techni_key";

-- AlterTable
ALTER TABLE "maintenance_request_technicians" ADD COLUMN     "removedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "maintenance_request_technicians_maintenanceRequestId_techni_idx" ON "maintenance_request_technicians"("maintenanceRequestId", "technicianId");
