-- CreateEnum
CREATE TYPE "MaintenanceRequestResponsibleArea" AS ENUM ('MANTENIMIENTO', 'PRODUCCION');

-- AlterTable
ALTER TABLE "maintenance_requests" ADD COLUMN     "responsibleArea" "MaintenanceRequestResponsibleArea";
