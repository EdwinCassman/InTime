import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STANDARD_SHIFT_TEMPLATES = [
  {
    name: "Öppning",
    weekdayStart: "05:00",
    weekdayEnd: "12:30",
    weekdayEndNextDay: false,
    weekendStart: "07:00",
    weekendEnd: "14:00",
    weekendEndNextDay: false,
  },
  {
    name: "Dag",
    weekdayStart: "10:00",
    weekdayEnd: "17:00",
    weekdayEndNextDay: false,
    weekendStart: "12:00",
    weekendEnd: "19:30",
    weekendEndNextDay: false,
  },
  {
    name: "Stängning",
    weekdayStart: "16:45",
    weekdayEnd: "00:15",
    weekdayEndNextDay: true,
    weekendStart: "16:45",
    weekendEnd: "00:15",
    weekendEndNextDay: true,
  },
];

async function seedShiftTemplates() {
  for (const template of STANDARD_SHIFT_TEMPLATES) {
    await prisma.shiftTemplate.upsert({
      where: { name: template.name },
      create: template,
      update: template,
    });
  }
  console.log(`Seeded ${STANDARD_SHIFT_TEMPLATES.length} standard shift templates.`);
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "changeme123";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists, skipping admin seed.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { email, name: "Admin", passwordHash, role: "ADMIN" },
  });

  console.log(`Created admin user: ${email} / ${password}`);
  console.log("Change this password after first login.");
}

async function main() {
  await seedShiftTemplates();
  await seedAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
