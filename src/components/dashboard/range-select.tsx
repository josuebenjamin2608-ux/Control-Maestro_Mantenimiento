"use client";

import { useRef } from "react";

export interface RangeOption {
  label: string;
  value: string;
}

export function RangeSelect({ options, value }: { options: RangeOption[]; value: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} method="get" className="flex items-center gap-2">
      <select
        name="range"
        defaultValue={value}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </form>
  );
}
