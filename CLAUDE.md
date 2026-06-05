# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

**Always follow this flow for every change (fix, feature, refactor, etc.):**

1. Create a branch before starting: `git checkout -b type/short-description` (e.g. `fix/login-csrf`, `feat/link-monitoring`)
2. Implement the changes
3. **Wait for user validation before committing**
4. After user confirms, commit on the branch
5. Merge into main: `git checkout main && git merge --no-ff branch-name && git branch -d branch-name`

Never commit directly to `main`. Never merge without explicit user approval.

## Common Commands

```bash
# First-time setup
docker compose up -d      # Start PostgreSQL container
npm run db:migrate        # Apply migrations and create tables
npm run create-user       # Create initial admin user

# Development (Next.js + monitoring worker simultaneously)
npm run dev:all

# Run only the Next.js dev server
npm run dev

# Run only the background monitoring worker
npm run worker

# Tests
npm test                  # Run all tests (85 tests)
npm run test:coverage     # With coverage report

# Database
npm run db:migrate        # Apply pending migrations
npm run db:studio         # Open Prisma Studio GUI
npm run db:generate       # Regenerate Prisma client after schema changes

# Security
npm run seed:security     # Populate initial security findings as notes

# Type checking
npx tsc --noEmit
```

## Architecture

This is a local IT monitoring dashboard built with:
- **Next.js 14 (App Router)** — frontend + API routes
- **shadcn/ui v4 (Base UI)** — component library
- **Prisma 7 + PostgreSQL** — database via Docker (`docker-compose.yml`)
- **NextAuth.js v5** — JWT authentication (credentials provider)
- **`worker/`** — separate Node.js process that polls devices and writes to the database

### Database Setup

The database runs in Docker. Connection string is set in `.env`:
```
DATABASE_URL="postgresql://it_dashboard:it_dashboard@localhost:5432/it_dashboard"
```

`prisma.config.ts` loads `.env` via `dotenv/config` and validates that `DATABASE_URL` is set —
it throws an error at startup if missing (prevents the "dev-secret" class of silent misconfiguration).

After changing `prisma/schema.prisma`, always run:
```bash
npm run db:migrate    # creates and applies the migration
npm run db:generate   # regenerates the Prisma client types
```

Since `prisma migrate dev` requires a TTY, apply migrations manually in Docker:
```bash
docker compose exec -T postgres psql -U it_dashboard -d it_dashboard -f migration.sql
# then register the migration in _prisma_migrations manually
npm run db:generate
```

### Key Architectural Points

**Two-process model:** `npm run dev:all` runs Next.js and `worker/index.ts` in parallel via `concurrently`. The worker runs background monitoring checks independently of HTTP requests.

**Monitoring worker flow:** `worker/scheduler.ts` reads all devices from the DB, sets up a `setInterval` per device (based on `device.checkInterval`), and every tick runs the enabled monitors in parallel via `Promise.allSettled`. Results are written to `DeviceStatus` (upsert, one row per device) and `StatusHistory` (append, for graphs). Links with RouterOS config are polled every 60s via `pollLinks()`.

**RouterOS traffic measurement:** `/interface/monitor-traffic` is a streaming command and does not accept `=count=` via the API. Instead, `worker/monitors/link-traffic.ts` reads `rx-byte`/`tx-byte` from `/interface/print` twice with a 1-second interval and computes `(Δbytes × 8) = bits/second`.

**shadcn/ui v4 uses Base UI:** The `Button` component does not support `asChild`. Use `buttonVariants()` with a Next.js `<Link>` when you need a link styled as a button. For dialogs, use the `render` prop on Base UI trigger components.

**Authentication middleware:** `middleware.ts` protects all routes except `/login` and `/api/auth/*`. The session is JWT-based, no database sessions.

**`GET /api/devices` supports `?type=` filter** — pass a `DeviceType` value (e.g. `?type=MIKROTIK`) to filter by device type. Used by the link form to populate the Mikrotik dropdown.

### File Structure

```
app/
  (auth)/login/           # Login page (public)
  (dashboard)/            # All protected pages (layout checks session)
    page.tsx              # Overview dashboard: KPIs, system health, links table,
                          #   incidents timeline, device grid — polls every 30s
    devices/
      page.tsx            # Device list table
      [id]/page.tsx       # Device detail with charts
      [id]/edit/page.tsx  # Edit form
      new/page.tsx        # Create form
    links/
      page.tsx            # Link management: table with bandwidth utilization,
                          #   form with RouterOS config + contracted bandwidth
      [id]/page.tsx       # Link detail with traffic card
    incidents/
      page.tsx            # Incidents history page
    notes/
      page.tsx            # Security notes & issue tracking
  api/
    auth/[...nextauth]/   # NextAuth handler
    devices/              # GET all (supports ?type=), POST create
    devices/[id]/         # GET one, PUT update, DELETE
    status/[deviceId]/    # GET history (query: ?hours=24)
    health/               # GET system health summary (uptime %, counts)
    overview/             # GET sparklines + link segments for dashboard
    incidents/            # GET incident list derived from StatusHistory
    timeline/             # GET unified event timeline (devices + links, ?hours=24)
    links/                # GET all, POST create
    links/[id]/           # GET one, PUT update, DELETE
    links/[id]/up|down    # Webhook endpoints to set link status
    links/test-traffic    # POST: validate RouterOS connection before saving
    notes/                # GET all, POST create
    notes/[id]/           # GET one, PUT update, DELETE

worker/
  index.ts                # Entry point
  scheduler.ts            # Per-device setInterval + pollLinks() every 60s
  monitors/
    ping.ts               # ICMP via `ping` package
    http.ts               # HTTP fetch check
    snmp.ts               # SNMP v2c via `net-snmp`
    routeros.ts           # RouterOS API via `routeros` package
    link-traffic.ts       # RouterOS two-sample traffic measurement

lib/
  db.ts                   # Prisma client singleton
  auth.ts                 # NextAuth configuration
  format.ts               # formatUptime, formatResponseTime, formatPercent

components/
  device-card.tsx         # Card used in the overview grid
  device-detail-drawer.tsx  # Slide-in drawer with device details + sparkline
  device-form.tsx         # Shared form for create/edit (react-hook-form + zod)
  device-type-badge.tsx   # Colored badge per device type
  link-detail-drawer.tsx  # Slide-in drawer with link details + live traffic tiles
  status-badge.tsx        # Online/Offline badge
  metrics-chart.tsx       # Recharts AreaChart wrapper
  ping-chart.tsx          # Ping history chart
  ping-sparkline.tsx      # Inline SVG sparkline for ping history
  topbar.tsx              # Page header with title, subtitle, live indicator
  sidebar.tsx             # Navigation sidebar
  ui/                     # shadcn components (do not edit manually)

prisma/
  schema.prisma           # DB schema (see summary below)
  migrations/             # Migration history (PostgreSQL)

scripts/
  create-user.ts          # CLI to create/update admin user
  seed-security-notes.ts  # Populates initial security findings as notes

__tests__/
  lib/                    # Unit tests for format utilities
  api/                    # API route tests (devices, status, notes)
  worker/                 # Worker monitor tests (ping, http, snmp, routeros)
  components/             # React component tests
  security/               # Security-focused tests (auth enforcement)
```

### Database Schema Summary

- `Device` — device config (IP, type, location, enabled protocols, credentials, check interval)
- `DeviceStatus` — one row per device, latest check result (upserted on each check)
- `StatusHistory` — append-only log of each check result, indexed by `(deviceId, timestamp)`
- `User` — bcrypt-hashed credentials for dashboard login
- `Note` — security/operational notes with severity (INFO/WARNING/HIGH/CRITICAL), category, and status tracking
- `Link` — internet link config; fields include `location`, `isOnline`, `mikrotikDeviceId` (FK→Device), `mikrotikInterface`, `downloadBps`, `uploadBps`, `latencyMs` (live traffic from worker), `contractedDownloadBps`, `contractedUploadBps` (manually configured bandwidth ceiling)
- `LinkEvent` — UP/DOWN webhook events per link, indexed by `(linkId, timestamp)`

### Adding a New Monitor Protocol

1. Create `worker/monitors/yourprotocol.ts` returning a typed result interface
2. Import and call it in `worker/scheduler.ts` inside `runChecks()` using `Promise.allSettled`
3. Map the result fields to the DB write (upsert `DeviceStatus`, insert `StatusHistory`)
4. Add enable/config fields to `prisma/schema.prisma`, run `npm run db:migrate`
5. Expose toggle + config fields in `components/device-form.tsx`

### Link Bandwidth Utilization

The `BandwidthCell` component (used in the dashboard and links table) shows current traffic vs contracted bandwidth with a color-coded progress bar:
- **Green** — below 70% utilization
- **Amber** — 70–90%
- **Red** — above 90%

Contracted values are stored in bps but entered/displayed in Mbps in the form.
