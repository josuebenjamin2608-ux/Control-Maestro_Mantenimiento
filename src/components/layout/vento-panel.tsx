import { Sparkles } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SUGGESTED_QUESTIONS = [
  "¿Cuántas solicitudes están pendientes?",
  "¿Qué máquina tiene más novedades?",
  "Resume la última importación",
];

/**
 * Vista previa estática del asistente Vento: no está conectado a ningún
 * modelo, así que no genera respuestas. El input queda deshabilitado para no
 * simular una conversación que el sistema todavía no puede sostener.
 */
export function VentoPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Sparkles className="size-4 text-primary" />
          Vento
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Hola, soy Vento. Este asistente todavía no está conectado a un modelo de lenguaje —
          por ahora es solo una vista previa de la interfaz.
        </p>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Preguntas sugeridas
          </span>
          <div className="flex flex-col gap-1.5">
            {SUGGESTED_QUESTIONS.map((question) => (
              <span
                key={question}
                className="cursor-not-allowed rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm text-muted-foreground"
              >
                {question}
              </span>
            ))}
          </div>
        </div>

        <input
          type="text"
          disabled
          placeholder="Próximamente..."
          className="h-9 w-full rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground outline-none"
        />
      </CardContent>
    </Card>
  );
}
