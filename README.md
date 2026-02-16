# Sanjeevni

**Sanjeevni** is a digital pharmacy management and availability platform for urban and rural India. It streamlines pharmacy inventory management, allows users to discover medicines in stock at local pharmacies, and facilitates digital prescription sharing and fulfillment.

## Features

- **Medicine Search & Availability**: Instantly search and locate medicines at nearby pharmacies.
- **Pharmacy Inventory Management**: Simple interface for pharmacies to update and manage their stock.
- **Digital Prescriptions**: Patients can upload prescriptions and order medicines directly.
- **Secure Authentication**: Role-based access for pharmacists, doctors, and patients.
- **Progressive Web App**: Installable, offline-friendly experience for users and pharmacists.
- **Admin Dashboard**: Oversee all operations, approve pharmacy accounts, and monitor platform usage.
- **Modern Tech Stack**: Built with Next.js, Hono, Bun, Prisma, and TailwindCSS.

## Quick Start

**1. Install dependencies:**
```bash
bun install
```

**2. Environment setup:**

- Set up PostgreSQL and update your environment variables in `apps/server/.env` and `apps/web/.env`.

**3. Prepare the database:**
```bash
bun run db:push
```

**4. Start the development servers:**
```bash
bun run dev
```
- Web UI: [http://localhost:3001](http://localhost:3001)
- API server: [http://localhost:3000](http://localhost:3000)

## Project Structure

```
sanjeevni/
├── apps/
│   ├── web/         # Patient and pharmacist-facing UI (Next.js)
│   └── server/      # REST API backend (Hono)
├── packages/
│   ├── auth/        # Authentication logic and config
│   └── db/          # Prisma schema and database queries
```

## Useful Scripts

- `bun run dev` — Start both frontend and backend in dev mode
- `bun run build` — Build all applications for production
- `bun run dev:web` — Start only the web app
- `bun run dev:server` — Start only the backend API
- `bun run check-types` — Type checking for all packages
- `bun run db:push` — Push Prisma schema to DB
- `bun run db:generate` — Generate Prisma client
- `bun run db:migrate` — Run database migrations
- `bun run db:studio` — Open Prisma database studio
- `cd apps/web && bun run generate-pwa-assets` — Regenerate PWA assets

## Contributing

We welcome PRs and feature suggestions! Please create issues for bugs and enhancement requests.

---

_The Sanjeevni Project — Digitizing Healthcare Access_
