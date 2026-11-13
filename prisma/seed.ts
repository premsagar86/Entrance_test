import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/** Digits only (an optional leading + is dropped); must match src/lib/phone.ts. */
function normalizePhone(input: string): string | null {
  const cleaned = input.replace(/[\s\-().]/g, "");
  return /^\+?\d{8,15}$/.test(cleaned) ? cleaned.replace(/^\+/, "") : null;
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const phone = normalizePhone(process.env.SEED_ADMIN_PHONE?.trim() ?? "");
  if (!email || !phone) {
    throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PHONE (8-15 digits, e.g. 1234567890 or +919876543210)");
  }
  // Update the phone too, so editing .env and re-running the seed changes the admin's number.
  await db.admin.upsert({
    where: { email },
    update: { phone },
    create: { email, phone, name: "Admin" },
  });
  console.log("Seeded admin", email);
}

main().finally(() => db.$disconnect());
