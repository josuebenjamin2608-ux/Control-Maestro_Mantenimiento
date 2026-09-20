-- AlterTable
ALTER TABLE "technicians" ADD COLUMN     "telegramChatId" TEXT,
ADD COLUMN     "telegramLinkedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "technician_telegram_link_codes" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_telegram_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "technician_telegram_link_codes_code_key" ON "technician_telegram_link_codes"("code");

-- CreateIndex
CREATE INDEX "technician_telegram_link_codes_technicianId_idx" ON "technician_telegram_link_codes"("technicianId");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_telegramChatId_key" ON "technicians"("telegramChatId");

-- AddForeignKey
ALTER TABLE "technician_telegram_link_codes" ADD CONSTRAINT "technician_telegram_link_codes_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "technicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

