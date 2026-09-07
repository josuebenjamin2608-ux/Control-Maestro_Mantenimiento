import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ImportBatch } from "@/generated/prisma/client";

type ImportBatchWithUser = ImportBatch & { importedBy: { name: string } | null };

const FILE_TYPE_LABELS: Record<ImportBatch["fileType"], string> = {
  MAINTENANCE_REQUEST: "Solicitudes",
  MAINTENANCE_LOG: "Minutas",
};

const dateFormatter = new Intl.DateTimeFormat("es", {
  dateStyle: "short",
  timeStyle: "short",
});

export function ImportHistoryTable({ batches }: { batches: ImportBatchWithUser[] }) {
  if (batches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no se ha procesado ninguna importación.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Archivo</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Detalle</TableHead>
            <TableHead>Errores</TableHead>
            <TableHead>Usuario</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((batch) => (
            <TableRow key={batch.id}>
              <TableCell className="whitespace-nowrap">
                {dateFormatter.format(batch.createdAt)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  {FILE_TYPE_LABELS[batch.fileType]}
                  {batch.isHistorical ? <Badge variant="outline">Histórico</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="max-w-48 truncate" title={batch.fileName}>
                {batch.fileName}
              </TableCell>
              <TableCell>{batch.totalRows}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {batch.fileType === "MAINTENANCE_REQUEST" ? (
                  <span>
                    {batch.newCount ?? 0} nuevas · {batch.modifiedCount ?? 0} modificadas ·{" "}
                    {batch.unchangedCount ?? 0} sin cambios
                    {batch.retroactivelyRelatedCount
                      ? ` · ${batch.retroactivelyRelatedCount} minutas relacionadas`
                      : ""}
                  </span>
                ) : (
                  <span>
                    {batch.newCount ?? 0} nuevas ({batch.relatedCount ?? 0} relacionadas,{" "}
                    {batch.pendingCount ?? 0} pendientes) · {batch.alreadyExistsCount ?? 0} ya
                    existían
                  </span>
                )}
              </TableCell>
              <TableCell>
                {batch.errorCount > 0 ? (
                  <Badge variant="destructive">{batch.errorCount}</Badge>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>{batch.importedBy?.name ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
