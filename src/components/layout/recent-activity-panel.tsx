import { FileText, UploadCloud } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/estado";
import { listImportBatches } from "@/server/services/maintenance-requests.service";

const FILE_TYPE_LABELS: Record<string, string> = {
  MAINTENANCE_REQUEST: "Solicitudes importadas",
  MAINTENANCE_LOG: "Minutas importadas",
};

/** Actividad real basada en ImportBatch — no inventa entradas (p.ej. "Sistema iniciado"). */
export async function RecentActivityPanel() {
  const batches = await listImportBatches(8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">Actividad reciente</CardTitle>
      </CardHeader>
      <CardContent>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no se ha registrado ninguna importación.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {batches.map((batch) => {
              const Icon = batch.fileType === "MAINTENANCE_REQUEST" ? FileText : UploadCloud;
              return (
                <li key={batch.id} className="flex items-start gap-2.5 text-sm">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <div className="flex flex-1 flex-col">
                    <span className="text-foreground">
                      {FILE_TYPE_LABELS[batch.fileType]} · {batch.totalRows} fila
                      {batch.totalRows === 1 ? "" : "s"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {batch.fileName} · {formatRelativeTime(batch.createdAt)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
