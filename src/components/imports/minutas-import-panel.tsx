"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { AlertCircle, CheckCircle2, UploadCloud } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  confirmMaintenanceLogFile,
  previewMaintenanceLogFile,
  type MaintenanceLogPreviewPayload,
} from "@/server/actions/imports";
import { HistoricalBadge, OutcomeBadge } from "./outcome-badge";

type Stage = "idle" | "loading" | "preview" | "confirming" | "done";

export function MinutasImportPanel() {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MaintenanceLogPreviewPayload | null>(null);
  const [isHistorical, setIsHistorical] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{ importBatchId: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const isLocked = stage !== "idle";

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    setPreview(null);
    setConfirmResult(null);
    setStage("loading");

    const formData = new FormData();
    formData.set("file", file);
    formData.set("isHistorical", String(isHistorical));

    startTransition(async () => {
      const result = await previewMaintenanceLogFile(formData);
      if (!result.ok) {
        setError(result.error);
        setStage("idle");
        return;
      }
      setPreview(result.data);
      setStage("preview");
    });
  }

  function handleConfirm() {
    if (!preview) return;
    setStage("confirming");
    startTransition(async () => {
      const result = await confirmMaintenanceLogFile({
        fileName: preview.fileName,
        isHistorical,
        rows: preview.rows,
      });
      if (!result.ok) {
        setError(result.error);
        setStage("preview");
        return;
      }
      setConfirmResult(result.data);
      setStage("done");
    });
  }

  function handleReset() {
    setPreview(null);
    setConfirmResult(null);
    setError(null);
    setIsHistorical(false);
    setStage("idle");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cargar Registro de Minutas</CardTitle>
        <CardDescription>
          Archivo .xlsx con las columnas REGISTRO, FECHAINI, ORDEN, MAQUINA, OPER, NOMBREORD,
          CCOSTO, OPERACION, CANTIDAD, CODEMP, EMPLEADO, FECHAFIN, HORAINI, HORAFIN, MINUTOS,
          OBSERVACIONES. Fuente complementaria: nunca crea una solicitud nueva.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex items-start gap-2 rounded-md border border-border bg-secondary/30 p-3 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isHistorical}
            disabled={isLocked}
            onChange={(event) => setIsHistorical(event.target.checked)}
            className="mt-0.5 size-4 rounded border-input"
          />
          <span>
            Esta carga corresponde al <strong>HISTÓRICO INICIAL</strong> de minutas.
            <br />
            <span className="text-xs text-muted-foreground">
              Las minutas históricas se importan tal cual, sin intentar relacionarlas con ninguna
              solicitud (OBSERVACIONES en el archivo histórico no contiene necesariamente una
              PARTE). Selecciona esta opción antes de elegir el archivo.
            </span>
          </span>
        </label>

        {stage === "idle" || stage === "loading" ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground hover:bg-secondary/50">
            <UploadCloud className="size-6" />
            {stage === "loading" ? "Leyendo archivo..." : "Seleccionar archivo .xlsx"}
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              disabled={isPending}
              onChange={handleFileChange}
            />
          </label>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>No se pudo procesar el archivo</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {preview && stage !== "done" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-foreground">{preview.fileName}</span>
              <HistoricalBadge isHistorical={isHistorical} />
              <Badge variant="success">{preview.summary.newCount} nuevas</Badge>
              <Badge variant="secondary">{preview.summary.alreadyExistsCount} ya existían</Badge>
              {isHistorical ? null : (
                <>
                  <Badge variant="success">{preview.summary.relatedCount} relacionadas</Badge>
                  <Badge variant="warning">
                    {preview.summary.pendingCount} pendientes de relación
                  </Badge>
                </>
              )}
              {preview.summary.errorCount > 0 ? (
                <Badge variant="destructive">{preview.summary.errorCount} errores</Badge>
              ) : null}
            </div>

            <div className="max-h-96 overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fila</TableHead>
                    <TableHead>REGISTRO</TableHead>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead>Relación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.summary.rows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.registro ?? "—"}</TableCell>
                      <TableCell>{row.data?.empleado ?? "—"}</TableCell>
                      <TableCell title={row.errorMessage}>
                        <OutcomeBadge outcome={row.outcome} />
                      </TableCell>
                      <TableCell>
                        {row.outcome === "NEW" && row.relationOutcome ? (
                          <OutcomeBadge outcome={row.relationOutcome} historical={isHistorical} />
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleConfirm} disabled={isPending}>
                {stage === "confirming" ? "Aplicando..." : "Confirmar importación"}
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={isPending}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "done" && confirmResult ? (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertTitle>Importación aplicada</AlertTitle>
            <AlertDescription>
              <p>Los cambios se guardaron en la base de datos.</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={handleReset}>
                Cargar otro archivo
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
