export const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export interface Period {
  year: number;
  month: number;
}

/**
 * [start, end) del mes calendario dado, anclado a UTC — igual que FECHA de
 * Solicitud, que se almacena como medianoche UTC del día calendario (ver
 * `src/lib/dates.ts`). Usar `Date.UTC` explícitamente (en vez de
 * `new Date(year, month, day)`, que interpreta en hora local del proceso)
 * evita que este rango se desplace si el proceso corre en una zona horaria
 * distinta de UTC.
 */
export function getPeriodRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

export function getPreviousPeriod({ year, month }: Period): Period {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function formatPeriodLabel({ year, month }: Period): string {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}
