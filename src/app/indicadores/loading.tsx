import { Loader2 } from "lucide-react";

export default function IndicadoresLoading() {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      <p className="text-sm">Calculando indicadores...</p>
    </div>
  );
}
