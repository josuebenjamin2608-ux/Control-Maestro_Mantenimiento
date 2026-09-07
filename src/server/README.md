# src/server

Server-only code, organized by responsibility rather than by domain, so UI
components never import business logic directly:

- `actions/` — Next.js Server Actions. Thin: parse/validate input (using the
  Zod schemas in `src/lib/validations`), call a service, return a
  serializable result. No business rules here.
- `services/` — Business logic and Prisma queries, grouped by domain
  (e.g. `machines.ts`, `maintenance-orders.ts`). This is the only layer that
  talks to `src/lib/db.ts`.

Both are empty in this phase — they will be filled in per module as each
domain (Máquinas, Órdenes de Trabajo, Preventivo, Inventario, ...) is built.
