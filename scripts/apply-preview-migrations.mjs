#!/usr/bin/env node
// Runs `prisma migrate deploy` only when Vercel is building the Preview
// environment. Vercel sets VERCEL_ENV to "production", "preview" or
// "development" during a build; it is unset entirely outside Vercel (local
// `next build`, `npm run dev`, CI, etc.), so this never fires there either.
//
// Production is NEVER migrated by this script, structurally: the only
// branch that calls `prisma migrate deploy` is guarded by
// `VERCEL_ENV === "preview"`. A non-zero exit here makes the calling `&&`
// chain in package.json's `build` script skip `next build`, so a failed
// migration never results in deploying an app against a stale schema.

import { spawnSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV;

if (vercelEnv !== "preview") {
  console.log(
    `[apply-preview-migrations] VERCEL_ENV=${vercelEnv ?? "(unset)"} — se omite \`prisma migrate deploy\` (solo corre en Preview).`,
  );
  process.exit(0);
}

if (!process.env.DIRECT_URL) {
  console.warn(
    "[apply-preview-migrations] Advertencia: DIRECT_URL no está definida; prisma7.config.ts usará DATABASE_URL (pooled) como fallback, lo que puede fallar en `migrate deploy`.",
  );
}

console.log("[apply-preview-migrations] VERCEL_ENV=preview — ejecutando `prisma migrate deploy`...");

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: false,
});

if (result.error) {
  console.error("[apply-preview-migrations] No se pudo ejecutar `prisma migrate deploy`:", result.error);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(
    `[apply-preview-migrations] \`prisma migrate deploy\` falló con código ${result.status}. Se aborta el build para no desplegar con un schema desincronizado.`,
  );
  process.exit(result.status ?? 1);
}

console.log("[apply-preview-migrations] Migraciones aplicadas correctamente.");
