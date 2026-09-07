"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { AlertCircle, CheckCircle2, UploadCloud } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  confirmMaintenanceRequestFile,
  previewMaintenanceRequestFile,
  type MaintenanceRequestPreviewPayload,
} from "@/server/actions/imports";
import { OutcomeBadge } from "./outcome-badge";

type Stage = "idle" | "loading" | "preview" | "confirming" | "done";

export function SolicitudesImportPanel() {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<MaintenanceRequestPreviewPayload | null>(null);
  const [isHistorical, setIsHistorical] = useState(false);
  const [confirmResult, setConfirmResult] = useState<{
    importBatchId: string;
    retroactivelyRelatedCount: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

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

    startTransition(async () => {
      const result = await previewMaintenanceRequestFile(formData);
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
      const result = await confirmMaintenanceRequestFile({
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
        <CardTitle>Cargar Registro de Solicitudes</CardTitle>
        <CardDescription>
          Archivo .xlsx con las columnas PARTE, CODIGO, MAQUINA, PIEZA, PROBLEMA, TAREA, FECHA,
          CODEMPLE, EMPLEADO, ESTADO. Fuente principal: puede cargarse sola, sin minutas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
              <Badge variant="success">{preview.summary.newCount} nuevas</Badge>
              <Badge variant="warning">{preview.summary.modifiedCount} modificadas</Badge>
              <Badge variant="secondary">{preview.summary.unchangedCount} sin cambios</Badge>
              {preview.summary.errorCount > 0 ? (
                <Badge variant="destructive">{preview.summary.errorCount} errores</Badge>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={isHistorical}
                onChange={(event) => setIsHistorical(event.target.checked)}
                className="size-4 rounded border-input"
              />
              Esta carga corresponde al <strong>HISTÓRICO INICIAL</strong>
            </label>

            <div className="max-h-96 overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fila</TableHead>
                    <TableHead>PARTE</TableHead>
                    <TableHead>Máquina</TableHead>
                    <TableHead>Problema</TableHead>
                    <TableHead>Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.summary.rows.map((row) => (
                    <TableRow key={row.rowNumber}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.parte ?? "—"}</TableCell>
                      <TableCell>{row.data?.maquina ?? "—"}</TableCell>
                      <TableCell className="max-w-64 truncate" title={row.data?.problema ?? row.errorMessage ?? undefined}>
                        {row.data?.problema ?? row.errorMessage ?? "—"}
                      </TableCell>
                      <TableCell>
                        <OutcomeBadge outcome={row.outcome} />
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
              {confirmResult.retroactivelyRelatedCount > 0 ? (
                <p>
                  {confirmResult.retroactivelyRelatedCount} minuta(s) pendiente(s) se relacionaron
                  automáticamente.
                </p>
              ) : null}
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
