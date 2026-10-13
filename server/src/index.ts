import "dotenv/config";
import cors from "cors";
import express from "express";
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

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`InTime API listening on http://localhost:${port}`);
});
