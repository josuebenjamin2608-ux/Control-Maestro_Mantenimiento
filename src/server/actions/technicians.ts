"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { technicianInputSchema, type TechnicianInput } from "@/lib/validations/technicians";
import { Prisma } from "@/generated/prisma/client";
import { sendTechnicianAssignedNotification } from "@/server/services/telegram.service";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * `employeeCode` es NOT NULL + UNIQUE en el schema, pero ya no se pide como
 * dato de entrada (ver decisión del módulo de Técnicos): se genera acá como
 * identificador técnico interno, nunca mostrado como campo principal.
 */
function generateEmployeeCode(): string {
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `EMP-${timePart}${randomPart}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Asigna un técnico real (existente en la tabla Technician) a una Solicitud.
 * Idempotente: si ya está activamente asignado (removedAt = null), no hace
 * nada. Si existe una asignación anterior ya retirada para el mismo par
 * (solicitud, técnico), crea una fila NUEVA en vez de reutilizar la vieja —
 * así el historial conserva cada ciclo de asignación/retiro por separado.
 * Nunca crea técnicos nuevos.
 *
 * Notifica a Telegram (evento `technician_assigned`) exclusivamente cuando
 * esta llamada realmente crea la fila nueva en MaintenanceRequestTechnician
 * — nunca cuando el técnico ya estaba activamente asignado (evita
 * duplicar la notificación por un reintento o un doble clic sobre un
 * técnico ya asignado). Regla estricta: BD create exitoso -> Telegram,
 * nunca al revés; sendTechnicianAssignedNotification ya está diseñada para
 * nunca lanzar, pero igual se envuelve en Promise.allSettled (mismo
 * patrón defensivo que applyMaintenanceRequestImport en
 * maintenance-request-import.service.ts) para que, aunque ese contrato se
 * violara alguna vez, jamás pueda propagar una excepción que revierta la
 * asignación ya guardada ni que este Server Action responda como fallido.
 */
export async function assignTechnicianToRequest(
  maintenanceRequestId: string,
  technicianId: string,
): Promise<ActionResult<null>> {
  const [request, technician] = await Promise.all([
    db.maintenanceRequest.findUnique({ where: { id: maintenanceRequestId } }),
    db.technician.findUnique({
      where: { id: technicianId },
      select: { id: true, isActive: true, fullName: true },
    }),
  ]);

  if (!request) {
    return { ok: false, error: "La solicitud no existe." };
  }
  if (!technician) {
    return { ok: false, error: "El técnico no existe." };
  }
  if (!technician.isActive) {
    return { ok: false, error: "El técnico no está activo." };
  }

  const activeAssignment = await db.maintenanceRequestTechnician.findFirst({
    where: { maintenanceRequestId, technicianId, removedAt: null },
    select: { id: true },
  });

  if (!activeAssignment) {
    await db.maintenanceRequestTechnician.create({
      data: { maintenanceRequestId, technicianId },
    });

    // Solo se llega acá si el create de arriba ya confirmó en PostgreSQL.
    await Promise.allSettled([sendTechnicianAssignedNotification(request, technician.fullName)]);
  }

  revalidatePath(`/solicitudes/${encodeURIComponent(request.parte)}`);
  return { ok: true, data: null };
}

/**
 * Retira a un técnico de una Solicitud. NO borra la fila — completa
 * `removedAt` en la asignación activa, así queda trazabilidad de quién
 * estuvo asignado y cuándo se retiró. No borra al técnico ni modifica sus
 * datos propios.
 */
export async function unassignTechnicianFromRequest(
  maintenanceRequestId: string,
  technicianId: string,
): Promise<ActionResult<null>> {
  const request = await db.maintenanceRequest.findUnique({
    where: { id: maintenanceRequestId },
    select: { parte: true },
  });
  if (!request) {
    return { ok: false, error: "La solicitud no existe." };
  }

  await db.maintenanceRequestTechnician.updateMany({
    where: { maintenanceRequestId, technicianId, removedAt: null },
    data: { removedAt: new Date() },
  });

  revalidatePath(`/solicitudes/${encodeURIComponent(request.parte)}`);
  return { ok: true, data: null };
}

/**
 * Crea un técnico nuevo. Solo pide los datos propios del catálogo (nombre,
 * cargo/especialidad, activo); `employeeCode` se genera internamente.
 * Rechaza duplicados obvios: mismo nombre + mismo cargo (insensible a
 * mayúsculas/espacios), sin importar si el existente está activo o no —
 * evita catálogos con la misma persona cargada dos veces por error.
 */
export async function createTechnician(input: TechnicianInput): Promise<ActionResult<{ id: string }>> {
  const parsed = technicianInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { fullName, specialty, isActive } = parsed.data;

  const duplicate = await db.technician.findFirst({
    where: {
      fullName: { equals: fullName, mode: "insensitive" },
      specialty: { equals: specialty, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, error: "Ya existe un técnico con este nombre y cargo/especialidad." };
  }

  try {
    const technician = await db.technician.create({
      data: { fullName, specialty, isActive, employeeCode: generateEmployeeCode() },
      select: { id: true },
    });
    revalidatePath("/tecnicos");
    return { ok: true, data: technician };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { ok: false, error: "No se pudo generar un identificador único. Intenta de nuevo." };
    }
    return { ok: false, error: "No se pudo crear el técnico." };
  }
}

/** Edita nombre, cargo/especialidad y estado de un técnico existente. */
export async function updateTechnician(
  id: string,
  input: TechnicianInput,
): Promise<ActionResult<null>> {
  const parsed = technicianInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const { fullName, specialty, isActive } = parsed.data;

  const existing = await db.technician.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return { ok: false, error: "El técnico no existe." };
  }

  const duplicate = await db.technician.findFirst({
    where: {
      id: { not: id },
      fullName: { equals: fullName, mode: "insensitive" },
      specialty: { equals: specialty, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (duplicate) {
    return { ok: false, error: "Ya existe otro técnico con este nombre y cargo/especialidad." };
  }

  await db.technician.update({ where: { id }, data: { fullName, specialty, isActive } });
  revalidatePath("/tecnicos");
  return { ok: true, data: null };
}

/**
 * Activa/desactiva un técnico. Nunca lo elimina físicamente — conserva
 * todos sus datos y su historial de asignaciones (MaintenanceRequestTechnician
 * no se toca).
 */
export async function setTechnicianActive(id: string, isActive: boolean): Promise<ActionResult<null>> {
  const existing = await db.technician.findUnique({ where: { id }, select: { id: true } });
  if (!existing) {
    return { ok: false, error: "El técnico no existe." };
  }

  await db.technician.update({ where: { id }, data: { isActive } });
  revalidatePath("/tecnicos");
  return { ok: true, data: null };
}
