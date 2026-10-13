import "dotenv/config";
import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { recurringAssignmentsRouter } from "./routes/recurringAssignments.js";
import { reportsRouter } from "./routes/reports.js";
import { shiftClaimRequestsRouter } from "./routes/shiftClaimRequests.js";
import { shiftsRouter } from "./routes/shifts.js";
import { shiftTemplatesRouter } from "./routes/shiftTemplates.js";
import { timeOffRequestsRouter } from "./routes/timeOffRequests.js";

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRouter);
app.use("/employees", employeesRouter);
app.use("/shifts", shiftsRouter);
app.use("/shift-templates", shiftTemplatesRouter);
app.use("/recurring-assignments", recurringAssignmentsRouter);
app.use("/time-off-requests", timeOffRequestsRouter);
app.use("/shift-claim-requests", shiftClaimRequestsRouter);
app.use("/reports", reportsRouter);

// In production, this one service also serves the built React app, so there's
// a single deployable unit (no separate static host, no cross-origin calls).
// In dev, the frontend is served by Vite's own dev server instead.
if (process.env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.join(__dirname, "../../client/dist");

  app.use(express.static(clientDist));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`InTime listening on http://localhost:${port}`);
});
