import { Router } from "express";
import { z } from "zod";
import { computeShiftTimes } from "../lib/shiftTemplates.js";
import { ensureRollingSchedule } from "../lib/rollingSchedule.js";
import { removeShift } from "../lib/removeShift.js";
import { shiftsOverlap } from "../lib/shiftOverlap.js";
import { prisma } from "../lib/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

export const shiftsRouter = Router();

shiftsRouter.use(requireAuth);

const shiftInclude = {
  user: { select: { id: true, name: true } },
  originalUser: { select: { id: true, name: true } },
  shiftTemplate: true,
} as const;

const listQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  userId: z.string().optional(),
});

// Everyone can see the full team schedule, filtered by an optional date range / employee.
shiftsRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { from, to, userId } = parsed.data;

  await ensureRollingSchedule(to ? new Date(to) : undefined);

  const shifts = await prisma.shift.findMany({
    where: {
      userId,
      ...(from || to
        ? {
            startsAt: {
              gte: from ? new Date(from) : undefined,
              lte: to ? new Date(to) : undefined,
            },
          }
        : {}),
    },
    include: shiftInclude,
    orderBy: { startsAt: "asc" },
  });

  res.json(shifts);
});

// Either explicit startsAt/endsAt, or a standard shift template applied to a given date.
const createSchema = z
  .object({
    userId: z.string().min(1),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    shiftTemplateId: z.string().min(1).optional(),
    notes: z.string().optional(),
  })
  .refine((data) => (data.startsAt && data.endsAt) || (data.date && data.shiftTemplateId), {
    message: "Provide either startsAt/endsAt or date/shiftTemplateId",
  });

shiftsRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { userId, notes } = parsed.data;

  let startsAt: Date;
  let endsAt: Date;
  let shiftTemplateId: string | undefined;

  if (parsed.data.date && parsed.data.shiftTemplateId) {
    const template = await prisma.shiftTemplate.findUnique({ where: { id: parsed.data.shiftTemplateId } });
    if (!template) {
      return res.status(404).json({ error: "Shift template not found" });
    }
    const [year, month, day] = parsed.data.date.split("-").map(Number);
    const computed = computeShiftTimes(template, new Date(year, month - 1, day));
    startsAt = computed.startsAt;
    endsAt = computed.endsAt;
    shiftTemplateId = template.id;
  } else {
    startsAt = new Date(parsed.data.startsAt!);
    endsAt = new Date(parsed.data.endsAt!);
  }

  if (endsAt <= startsAt) {
    return res.status(400).json({ error: "endsAt must be after startsAt" });
  }

  const shift = await prisma.shift.create({
    data: { userId, startsAt, endsAt, notes, shiftTemplateId },
    include: shiftInclude,
  });

  res.status(201).json(shift);
});

// All other shifts (any employee) whose time range overlaps this one.
async function findOverlappingShifts(shift: { id: string; startsAt: Date; endsAt: Date }) {
  const windowStart = new Date(shift.startsAt);
  windowStart.setDate(windowStart.getDate() - 1);
  const windowEnd = new Date(shift.endsAt);
  windowEnd.setDate(windowEnd.getDate() + 1);

  const candidates = await prisma.shift.findMany({
    where: { id: { not: shift.id }, startsAt: { lt: windowEnd }, endsAt: { gt: windowStart } },
    include: shiftInclude,
  });
  return candidates.filter((c) => shiftsOverlap(shift, c));
}

// Full detail for a single shift: who else is working an overlapping shift,
// whether the viewer may read/post notes on it, and the viewer's own time-off
// request for it (if any).
shiftsRouter.get("/:id", async (req, res) => {
  const shift = await prisma.shift.findUnique({ where: { id: req.params.id }, include: shiftInclude });
  if (!shift) {
    return res.status(404).json({ error: "Shift not found" });
  }

  const coworkers = await findOverlappingShifts(shift);

  const isAdmin = req.user!.role === "ADMIN";
  const isOwn = shift.userId === req.user!.id;
  const hasOverlap = coworkers.some((c) => c.userId === req.user!.id);
  const canAccessNotes = isAdmin || isOwn || hasOverlap;

  // Excludes APPROVED: if the shift is currently assigned back to this person
  // (isOwn), any approved request on record for it must predate a later
  // reclaim (approving opens the shift, so isOwn+APPROVED can only coexist
  // after they — or the system — reassigned it back to them since). An old
  // approval isn't relevant once they're the current owner again.
  const myTimeOffRequest = isOwn
    ? await prisma.timeOffRequest.findFirst({
        where: { shiftId: shift.id, userId: req.user!.id, status: { in: ["PENDING", "DENIED"] } },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const myClaimRequest = !shift.userId
    ? await prisma.shiftClaimRequest.findFirst({
        where: { shiftId: shift.id, userId: req.user!.id },
        orderBy: { createdAt: "desc" },
      })
    : null;

  res.json({ shift, coworkers, canAccessNotes, myTimeOffRequest, myClaimRequest });
});

const noteSchema = z.object({ body: z.string().min(1).max(2000), type: z.enum(["INFO", "TODO"]).default("INFO") });
const noteInclude = {
  author: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  shift: { select: { id: true, userId: true, user: { select: { name: true } } } },
} as const;

// Returns the clicked shift plus every shift (any employee) overlapping it in
// time — notes attached to any shift in this group are considered part of
// the same conversation, since they all concern the same stretch of time.
async function getOverlapGroup(shiftId: string) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) return null;
  const coworkers = await findOverlappingShifts(shift);
  return { shift, groupIds: [shift.id, ...coworkers.map((c) => c.id)] };
}

function canAccessGroup(group: { shift: { userId: string | null } }, coworkerUserIds: (string | null)[], userId: string, isAdmin: boolean): boolean {
  return isAdmin || group.shift.userId === userId || coworkerUserIds.includes(userId);
}

shiftsRouter.get("/:id/notes", async (req, res) => {
  const group = await getOverlapGroup(req.params.id);
  if (!group) {
    return res.status(404).json({ error: "Shift not found" });
  }

  const coworkers = await findOverlappingShifts(group.shift);
  const allowed = canAccessGroup(group, coworkers.map((c) => c.userId), req.user!.id, req.user!.role === "ADMIN");
  if (!allowed) {
    return res.status(403).json({ error: "You don't have access to notes on this shift" });
  }

  const notes = await prisma.shiftNote.findMany({
    where: { shiftId: { in: group.groupIds } },
    include: noteInclude,
    orderBy: { createdAt: "asc" },
  });
  res.json(notes);
});

shiftsRouter.post("/:id/notes", async (req, res) => {
  const group = await getOverlapGroup(req.params.id);
  if (!group) {
    return res.status(404).json({ error: "Shift not found" });
  }

  const coworkers = await findOverlappingShifts(group.shift);
  const allowed = canAccessGroup(group, coworkers.map((c) => c.userId), req.user!.id, req.user!.role === "ADMIN");
  if (!allowed) {
    return res.status(403).json({ error: "You don't have access to notes on this shift" });
  }

  const parsed = noteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const note = await prisma.shiftNote.create({
    data: { shiftId: req.params.id, authorId: req.user!.id, body: parsed.data.body, type: parsed.data.type },
    include: noteInclude,
  });
  res.status(201).json(note);
});

const noteCompletionSchema = z.object({ completed: z.boolean() });

// Anyone with access to the note's shift (same overlap-group rule as viewing/
// posting notes) can check off or reopen a to-do — not just its author.
shiftsRouter.patch("/:id/notes/:noteId", async (req, res) => {
  const group = await getOverlapGroup(req.params.id);
  if (!group) {
    return res.status(404).json({ error: "Shift not found" });
  }

  const coworkers = await findOverlappingShifts(group.shift);
  const allowed = canAccessGroup(group, coworkers.map((c) => c.userId), req.user!.id, req.user!.role === "ADMIN");
  if (!allowed) {
    return res.status(403).json({ error: "You don't have access to notes on this shift" });
  }

  const note = await prisma.shiftNote.findUnique({ where: { id: req.params.noteId } });
  if (!note || !group.groupIds.includes(note.shiftId)) {
    return res.status(404).json({ error: "Note not found" });
  }
  if (note.type !== "TODO") {
    return res.status(400).json({ error: "Only to-do notes can be checked off" });
  }

  const parsed = noteCompletionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const updated = await prisma.shiftNote.update({
    where: { id: note.id },
    data: parsed.data.completed
      ? { completed: true, completedById: req.user!.id, completedAt: new Date() }
      : { completed: false, completedById: null, completedAt: null },
    include: noteInclude,
  });
  res.json(updated);
});

// Only the note's own author can delete it — not admins, not anyone else with
// access to view it.
shiftsRouter.delete("/:id/notes/:noteId", async (req, res) => {
  const note = await prisma.shiftNote.findUnique({ where: { id: req.params.noteId } });
  if (!note || note.shiftId !== req.params.id) {
    return res.status(404).json({ error: "Note not found" });
  }
  if (note.authorId !== req.user!.id) {
    return res.status(403).json({ error: "You can only delete your own notes" });
  }

  await prisma.shiftNote.delete({ where: { id: note.id } });
  res.status(204).send();
});

const timeOffRequestSchema = z.object({ reason: z.string().max(500).optional() });

// Only the shift's own employee can request to be taken off it.
shiftsRouter.post("/:id/time-off-requests", async (req, res) => {
  const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!shift) {
    return res.status(404).json({ error: "Shift not found" });
  }
  if (shift.userId !== req.user!.id) {
    return res.status(403).json({ error: "You can only request time off your own shifts" });
  }
  if (shift.startsAt <= new Date()) {
    return res.status(409).json({ error: "Can't request time off on a shift that has already started" });
  }

  const existing = await prisma.timeOffRequest.findFirst({
    where: { shiftId: shift.id, userId: req.user!.id, status: "PENDING" },
  });
  if (existing) {
    return res.status(409).json({ error: "You already have a pending request for this shift" });
  }

  const parsed = timeOffRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const request = await prisma.timeOffRequest.create({
    data: {
      userId: req.user!.id,
      shiftId: shift.id,
      shiftStartsAt: shift.startsAt,
      shiftEndsAt: shift.endsAt,
      reason: parsed.data.reason,
    },
  });
  res.status(201).json(request);
});

// Requests to take an open shift (one whose employee had a time-off request
// approved). Anyone without a conflicting shift at that time may request it,
// except the employee it was originally scheduled for. Admin picks who
// actually gets it — see routes/shiftClaimRequests.ts.
shiftsRouter.post("/:id/claim", async (req, res) => {
  const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!shift) {
    return res.status(404).json({ error: "Shift not found" });
  }
  if (shift.userId) {
    return res.status(409).json({ error: "This shift is not open" });
  }
  if (shift.originalUserId === req.user!.id) {
    return res.status(409).json({ error: "You can't claim a shift you were approved off of" });
  }

  const existing = await prisma.shiftClaimRequest.findFirst({
    where: { shiftId: shift.id, userId: req.user!.id, status: "PENDING" },
  });
  if (existing) {
    return res.status(409).json({ error: "You already requested this shift" });
  }

  const overlapping = await findOverlappingShifts(shift);
  if (overlapping.some((c) => c.userId === req.user!.id)) {
    return res.status(409).json({ error: "You already have a shift during this time" });
  }

  const request = await prisma.shiftClaimRequest.create({
    data: {
      userId: req.user!.id,
      shiftId: shift.id,
      shiftStartsAt: shift.startsAt,
      shiftEndsAt: shift.endsAt,
    },
  });
  res.status(201).json(request);
});

const actualTimesSchema = z
  .object({
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
  })
  .refine((data) => data.startsAt || data.endsAt, { message: "Provide startsAt and/or endsAt" });

function isQuarterHour(date: Date): boolean {
  return date.getMinutes() % 15 === 0 && date.getSeconds() === 0;
}

function sameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Self-service correction for the shift's own employee (e.g. "I arrived 45
// minutes late") — distinct from the admin-only PATCH below. Snapped to the
// nearest quarter-hour and can only be done once the shift has actually
// started, so it can't be used to pre-emptively change a future schedule.
shiftsRouter.patch("/:id/times", async (req, res) => {
  const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!shift) {
    return res.status(404).json({ error: "Shift not found" });
  }
  if (shift.userId !== req.user!.id) {
    return res.status(403).json({ error: "You can only adjust the times on your own shifts" });
  }
  if (shift.startsAt > new Date()) {
    return res.status(409).json({ error: "You can only adjust the times once the shift has started" });
  }

  const parsed = actualTimesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  let startsAt = shift.startsAt;
  let endsAt = shift.endsAt;

  if (parsed.data.startsAt) {
    const candidate = new Date(parsed.data.startsAt);
    if (!isQuarterHour(candidate)) {
      return res.status(400).json({ error: "Start time must be on a 15-minute mark (:00, :15, :30, :45)" });
    }
    if (!sameCalendarDay(candidate, shift.startsAt)) {
      return res.status(400).json({ error: "You can only adjust the time, not the date, of this shift" });
    }
    startsAt = candidate;
  }
  if (parsed.data.endsAt) {
    const candidate = new Date(parsed.data.endsAt);
    if (!isQuarterHour(candidate)) {
      return res.status(400).json({ error: "End time must be on a 15-minute mark (:00, :15, :30, :45)" });
    }
    if (!sameCalendarDay(candidate, shift.endsAt)) {
      return res.status(400).json({ error: "You can only adjust the time, not the date, of this shift" });
    }
    endsAt = candidate;
  }

  if (endsAt <= startsAt) {
    return res.status(400).json({ error: "End time must be after start time" });
  }

  const updated = await prisma.shift.update({
    where: { id: shift.id },
    data: { startsAt, endsAt },
    include: shiftInclude,
  });
  res.json(updated);
});

const updateSchema = z.object({
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

shiftsRouter.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const shift = await prisma.shift.update({
    where: { id: req.params.id },
    data: {
      ...parsed.data,
      startsAt: parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined,
      endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined,
    },
    include: shiftInclude,
  });

  res.json(shift);
});

// Deleting a shift always marks that (employee, day) as overridden, so the
// rolling-schedule generator never silently recreates it (e.g. a sick day).
shiftsRouter.delete("/:id", requireAdmin, async (req, res) => {
  const shift = await prisma.shift.findUnique({ where: { id: req.params.id } });
  if (!shift) {
    return res.status(404).json({ error: "Shift not found" });
  }

  await removeShift(shift.id);
  res.status(204).send();
});
