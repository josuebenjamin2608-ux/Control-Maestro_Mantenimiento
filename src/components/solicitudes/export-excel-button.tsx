"use client";

import { useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exportSolicitudesToExcel } from "@/server/actions/maintenance-requests";

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function downloadBase64File(base64: string, fileName: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: XLSX_MIME_TYPE });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exporta a Excel EXACTAMENTE las solicitudes que cumplen los filtros
 * actualmente aplicados en /solicitudes — los mismos search/maquina/estado/
 * responsable que la página ya lee de la URL (ver solicitudes/page.tsx),
 * nunca un filtro propio de este botón.
 */
export function ExportExcelButton({
  q,
  maquina,
  estado,
  responsable,
}: {
  q?: string;
  maquina?: string;
  estado?: string;
  responsable?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await exportSolicitudesToExcel({ search: q, maquina, estado, responsable });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      downloadBase64File(result.data.base64, result.data.fileName);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" className="gap-1.5" disabled={isPending} onClick={handleClick}>
        {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        Exportar Excel
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
