#!/usr/bin/env node
// Runs `prisma migrate deploy` only when Vercel is building the Preview
// environment. Vercel sets VERCEL_ENV to "production", "preview" or
// "development" during a build; it is unset entirely outside Vercel (local
// `next build`, `npm run dev`, CI, etc.), so this never fires there either.
//
// Production is NEVER migrated by this script, structurally: the only
// branch that calls `prisma migrate deploy` is guarded by
// `VERCEL_ENV === "preview"`.
//
// Retries: Neon (and similar serverless Postgres) suspends its compute
// when idle and can take a few seconds to resume on the first connection
// after a period of inactivity. A fresh Preview build's first
// `migrate deploy` attempt can land exactly during that wake-up window and
// see a transient P1001 ("Can't reach database server"), even though the
// same host answers normally moments later. Up to 3 attempts, with a
// growing pause between them, gives the database time to wake up before
// giving up — every attempt uses the same connection (DIRECT_URL via
// prisma7.config.ts), nothing else changes between retries.
//
// A non-zero exit here (after exhausting retries) still makes the calling
// `&&` chain in package.json's `build` script skip `next build`, so a
// failed migration never results in deploying an app against a stale
// schema.

import { execSync, spawnSync } from "node:child_process";

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

const MAX_ATTEMPTS = 3;
// Pausa antes de reintentar, en segundos (una entrada por reintento, no por intento).
const RETRY_DELAY_SECONDS = [5, 10];

function sleepSync(seconds) {
  execSync(`sleep ${seconds}`);
}

console.log("[apply-preview-migrations] VERCEL_ENV=preview — ejecutando `prisma migrate deploy`...");

let result;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  console.log(`[apply-preview-migrations] Intento ${attempt}/${MAX_ATTEMPTS}...`);

  result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: false,
  });

  if (!result.error && result.status === 0) {
    console.log("[apply-preview-migrations] Migraciones aplicadas correctamente.");
    process.exit(0);
  }

  if (result.error) {
    console.error(
      `[apply-preview-migrations] Intento ${attempt} no pudo ejecutar \`prisma migrate deploy\`:`,
      result.error,
    );
  } else {
    console.error(`[apply-preview-migrations] Intento ${attempt} falló con código ${result.status}.`);
  }

  const isLastAttempt = attempt === MAX_ATTEMPTS;
  if (!isLastAttempt) {
    const delay = RETRY_DELAY_SECONDS[attempt - 1] ?? RETRY_DELAY_SECONDS.at(-1);
    console.log(
      `[apply-preview-migrations] Reintentando en ${delay}s (posible arranque en frío de la base de datos)...`,
    );
    sleepSync(delay);
  }
}

console.error(
  `[apply-preview-migrations] \`prisma migrate deploy\` falló tras ${MAX_ATTEMPTS} intentos. Se aborta el build para no desplegar con un schema desincronizado.`,
);
process.exit(result?.status ?? 1);
