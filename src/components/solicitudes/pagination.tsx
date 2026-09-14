import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export function Pagination({
  basePath,
  searchParams,
  total,
  take,
  skip,
}: {
  basePath: string;
  searchParams: Record<string, string | undefined>;
  total: number;
  take: number;
  skip: number;
}) {
  if (total <= take) return null;

  const currentPage = Math.floor(skip / take) + 1;
  const totalPages = Math.ceil(total / take);

  function hrefForSkip(nextSkip: number) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value) params.set(key, value);
    }
    if (nextSkip > 0) params.set("skip", String(nextSkip));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const prevSkip = Math.max(0, skip - take);
  const nextSkip = skip + take;
  const isFirst = skip === 0;
  const isLast = nextSkip >= total;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <span>
        Página {currentPage} de {totalPages} · {total} resultado{total === 1 ? "" : "s"}
      </span>
      <div className="flex items-center gap-2">
        <Link
          href={hrefForSkip(prevSkip)}
          aria-disabled={isFirst}
          tabIndex={isFirst ? -1 : undefined}
          className={cn(
            "flex items-center gap-1 rounded-md border border-input px-2 py-1 hover:bg-secondary",
            isFirst && "pointer-events-none opacity-40",
          )}
        >
          <ChevronLeft className="size-4" />
          Anterior
        </Link>
        <Link
          href={hrefForSkip(nextSkip)}
          aria-disabled={isLast}
          tabIndex={isLast ? -1 : undefined}
          className={cn(
            "flex items-center gap-1 rounded-md border border-input px-2 py-1 hover:bg-secondary",
            isLast && "pointer-events-none opacity-40",
          )}
        >
          Siguiente
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
