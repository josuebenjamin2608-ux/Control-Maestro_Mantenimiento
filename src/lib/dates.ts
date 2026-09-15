/**
 * FECHA (fecha de solicitud, `MaintenanceRequest.fecha`) es una fecha
 * calendario pura: no tiene componente horario significativo. Se importa
 * y almacena como medianoche UTC del día indicado en el Excel (ver
 * `excel-parser.ts` / `cellToIsoDate`), precisamente para que ese día
 * calendario nunca dependa de en qué zona horaria corre el proceso que la
 * lee. Toda lectura, agrupación o formateo de este campo debe anclarse
 * explícitamente a UTC — nunca a la zona horaria implícita del entorno de
 * ejecución (que puede ser el servidor al atender un request, o el
 * navegador del usuario al hidratar un componente cliente). Sin ese
 * anclaje explícito, el mismo instante almacenado puede mostrar un día
 * calendario distinto según dónde se renderice.
 *
 * Esto NO aplica a FECHAFIN/FECHAINI de Minuta (`MaintenanceLog`), que sí
 * representan un instante real con hora significativa: esos campos siguen
 * formateándose con su propio `Intl.DateTimeFormat` en hora local, sin
 * usar este helper.
 */
export const CALENDAR_DATE_FORMATTER = new Intl.DateTimeFormat("es", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function formatCalendarDate(date: Date | null | undefined): string {
  return date ? CALENDAR_DATE_FORMATTER.format(date) : "—";
}
