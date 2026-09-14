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

/** [start, end) del mes calendario dado, en hora local del servidor. */
export function getPeriodRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

export function getPreviousPeriod({ year, month }: Period): Period {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function formatPeriodLabel({ year, month }: Period): string {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}
