-- CreateTable
CREATE TABLE "maintenance_request_technicians" (
    "id" TEXT NOT NULL,
    "maintenanceRequestId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_request_technicians_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_request_technicians_technicianId_idx" ON "maintenance_request_technicians"("technicianId");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_request_technicians_maintenanceRequestId_techni_key" ON "maintenance_request_technicians"("maintenanceRequestId", "technicianId");

-- AddForeignKey
ALTER TABLE "maintenance_request_technicians" ADD CONSTRAINT "maintenance_request_technicians_maintenanceRequestId_fkey" FOREIGN KEY ("maintenanceRequestId") REFERENCES "maintenance_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_request_technicians" ADD CONSTRAINT "maintenance_request_technicians_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;
