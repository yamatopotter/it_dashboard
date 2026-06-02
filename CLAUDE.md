# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
# Development (Next.js + monitoring worker simultaneously)
npm run dev:all

# Run only the Next.js dev server
npm run dev

# Run only the background monitoring worker
npm run worker

# Create initial admin user
npm run create-user

# Database
npm run db:migrate        # Apply pending migrations
npm run db:studio         # Open Prisma Studio GUI
npm run db:generate       # Regenerate Prisma client after schema changes

# Type checking
npx tsc --noEmit
```

## Architecture

This is a local IT monitoring dashboard built with:
- **Next.js 14 (App Router)** — frontend + API routes
- **shadcn/ui v4 (Base UI)** — component library
- **Prisma 7 + SQLite** — local database at `prisma/dev.db`
- **NextAuth.js v5** — JWT authentication (credentials provider)
- **`worker/`** — separate Node.js process that polls devices and writes to the database

### Key Architectural Points

**Two-process model:** `npm run dev:all` runs Next.js and `worker/index.ts` in parallel via `concurrently`. The worker runs background monitoring checks independently of HTTP requests.

**Monitoring worker flow:** `worker/scheduler.ts` reads all devices from the DB, sets up a `setInterval` per device (based on `device.checkInterval`), and every tick runs the enabled monitors in parallel via `Promise.allSettled`. Results are written to `DeviceStatus` (upsert, one row per device) and `StatusHistory` (append, for graphs).

**Database config (Prisma 7):** The `url` is configured in `prisma.config.ts`, not in `schema.prisma`. The `PrismaClient` in `lib/db.ts` uses a global singleton pattern to avoid multiple connections in dev.

**shadcn/ui v4 uses Base UI:** The `Button` component does not support `asChild`. Use `buttonVariants()` with a Next.js `<Link>` when you need a link styled as a button. For dialogs, use the `render` prop on Base UI trigger components.

**Authentication middleware:** `middleware.ts` protects all routes except `/login` and `/api/auth/*`. The session is JWT-based, no database sessions.

### File Structure

```
app/
  (auth)/login/           # Login page (public)
  (dashboard)/            # All protected pages (layout checks session)
    page.tsx              # Overview grid with polling every 30s
    devices/
      page.tsx            # Device list table
      [id]/page.tsx       # Device detail with charts
      [id]/edit/page.tsx  # Edit form
      new/page.tsx        # Create form
  api/
    auth/[...nextauth]/   # NextAuth handler
    devices/              # GET all, POST create
    devices/[id]/         # GET one, PUT update, DELETE
    status/[deviceId]/    # GET history (query: ?hours=24)

worker/
  index.ts                # Entry point
  scheduler.ts            # Per-device setInterval scheduling
  monitors/
    ping.ts               # ICMP via `ping` package
    http.ts               # HTTP fetch check
    snmp.ts               # SNMP v2c via `net-snmp`
    routeros.ts           # RouterOS API via `routeros` package

lib/
  db.ts                   # Prisma client singleton
  auth.ts                 # NextAuth configuration
  format.ts               # formatUptime, formatResponseTime, formatPercent

components/
  device-card.tsx         # Card used in the overview grid
  device-form.tsx         # Shared form for create/edit (react-hook-form + zod)
  device-type-badge.tsx   # Colored badge per device type
  status-badge.tsx        # Online/Offline badge
  metrics-chart.tsx       # Recharts AreaChart wrapper
  sidebar.tsx             # Navigation sidebar
  ui/                     # shadcn components (do not edit manually)

prisma/
  schema.prisma           # DB schema (Device, DeviceStatus, StatusHistory, User)
  migrations/             # Migration history
  dev.db                  # SQLite database (gitignored)

scripts/
  create-user.ts          # CLI to create/update admin user
```

### Database Schema Summary

- `Device` — device config (IP, type, enabled protocols, credentials, check interval)
- `DeviceStatus` — one row per device, latest check result (upserted on each check)
- `StatusHistory` — append-only log of each check result, indexed by `(deviceId, timestamp)`
- `User` — bcrypt-hashed credentials for dashboard login

### Adding a New Monitor Protocol

1. Create `worker/monitors/yourprotocol.ts` returning a typed result interface
2. Import and call it in `worker/scheduler.ts` inside `runChecks()` using `Promise.allSettled`
3. Map the result fields to the DB write (upsert `DeviceStatus`, insert `StatusHistory`)
4. Add enable/config fields to `prisma/schema.prisma`, run `npm run db:migrate`
5. Expose toggle + config fields in `components/device-form.tsx`
