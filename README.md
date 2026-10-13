# InTime

Employee scheduling app.

- **Schedule** — weekly view of all employees' shifts; admins create/edit/remove shifts; click a shift for details, coworkers, notes, and time-off requests.
- **Recurring Schedule** — each employee's standing 2-week rotation, auto-generated forward on a rolling basis.
- **Reports** — hours worked per employee for a given month, counted from completed scheduled shifts (full shift duration, no break deduction).
- **Requests** — admin review of time-off requests and open-shift claims.
- **Employees** — admin-only roster management (add, change role/rate, deactivate).

## Stack

- `client/` — React + TypeScript (Vite), Tailwind CSS, React Router
- `server/` — Node + Express + TypeScript, Prisma ORM
- PostgreSQL (run locally via Docker Compose)

## First-time setup

```bash
# 1. Start Postgres
docker compose up -d

# 2. Backend
cd server
cp .env.example .env
npm install
npm run prisma:migrate       # creates tables
SEED_ADMIN_EMAIL=you@company.com SEED_ADMIN_PASSWORD=yourpassword npm run seed
npm run dev                  # http://localhost:4000

# 3. Frontend (new terminal)
cd client
cp .env.example .env
npm install
npm run dev                  # http://localhost:5173
```

Log in with the admin email/password you seeded, then use the Employees page to add the rest of your team.

## Day-to-day

- `docker compose up -d` — start Postgres (only needed once per reboot)
- `cd server && npm run dev` — API on :4000
- `cd client && npm run dev` — web app on :5173
- `cd server && npm run prisma:studio` — browse/edit the database visually
