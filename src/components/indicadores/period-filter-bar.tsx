"use client";

import { useRef } from "react";

import { MONTH_LABELS } from "@/lib/period";

export function PeriodFilterBar({
  years,
  selectedYear,
  selectedMonth,
}: {
  years: number[];
  selectedYear: number;
  selectedMonth: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} method="get" className="flex flex-wrap items-center gap-2">
      <select
        name="year"
        defaultValue={selectedYear}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
      <select
        name="month"
        defaultValue={selectedMonth}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {MONTH_LABELS.map((label, index) => (
          <option key={label} value={index + 1}>
            {label}
          </option>
        ))}
      </select>
    </form>
  );
}
