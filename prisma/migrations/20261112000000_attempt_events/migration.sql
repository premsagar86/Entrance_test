-- CreateTable
CREATE TABLE "attempt_events" (
    "id" TEXT NOT NULL,
    "attempt_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attempt_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attempt_events_attempt_id_at_idx" ON "attempt_events"("attempt_id", "at");

-- AddForeignKey
ALTER TABLE "attempt_events" ADD CONSTRAINT "attempt_events_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
