import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const employeesRouter = Router();

employeesRouter.use(requireAuth);

// Any authenticated user can see the roster (names only matter for scheduling views).
employeesRouter.get("/", async (_req, res) => {
  const employees = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  res.json(employees);
});

const createSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE"),
});

employeesRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { email, name, password, role } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: "An employee with this email already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const employee = await prisma.user.create({
    data: { email, name, passwordHash, role },
    select: { id: true, name: true, email: true, role: true },
  });

  res.status(201).json(employee);
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
  active: z.boolean().optional(),
});

employeesRouter.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const employee = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data,
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  res.json(employee);
});

const resetPasswordSchema = z.object({ password: z.string().min(8) });

// Admin sets a new password for an employee who's forgotten theirs — passwords
// are one-way hashed, so there's no way to recover/display the old one.
employeesRouter.patch("/:id/password", requireAdmin, async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash } });
  res.status(204).send();
});

// Soft delete: deactivate rather than destroy history tied to shifts.
employeesRouter.delete("/:id", requireAdmin, async (req, res) => {
  await prisma.user.update({ where: { id: req.params.id }, data: { active: false } });
  res.status(204).send();
});
