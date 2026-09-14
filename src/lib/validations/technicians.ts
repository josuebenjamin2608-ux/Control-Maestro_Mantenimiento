import { z } from "zod";

/**
 * Único formulario de datos propios del técnico: nombre, cargo/especialidad
 * y estado activo/inactivo. `employeeCode` es un identificador interno
 * generado por el sistema (ver generateEmployeeCode en las Server Actions)
 * — nunca se pide ni se valida como entrada del usuario.
 */
export const technicianInputSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(200, "El nombre es demasiado largo."),
  specialty: z
    .string()
    .trim()
    .min(1, "El cargo/especialidad es obligatorio.")
    .max(200, "El cargo/especialidad es demasiado largo."),
  isActive: z.boolean(),
});

export type TechnicianInput = z.infer<typeof technicianInputSchema>;
