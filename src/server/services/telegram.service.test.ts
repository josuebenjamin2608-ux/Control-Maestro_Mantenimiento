import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MaintenanceRequest } from "@/generated/prisma/client";
import {
  buildTelegramLinkChatAlreadyLinkedText,
  buildTelegramLinkInvalidCodeText,
  buildTelegramLinkSuccessText,
  sendMaintenanceRequestCreatedNotification,
  sendTechnicianAssignedDirectNotification,
  sendTechnicianAssignedNotification,
  sendTelegramWebhookReply,
} from "./telegram.service";

const TOKEN_KEY = "TELEGRAM_BOT_TOKEN";
const CHAT_ID_KEY = "TELEGRAM_MAINTENANCE_CHAT_ID";

/** Token con forma válida (<bot_id>:<hash>) pero de prueba — nunca se envía a Telegram, fetch queda mockeado. */
const FAKE_TOKEN = "123456789:AA_test-token-DO-NOT-LEAK";
const FAKE_CHAT_ID = "-5522282943";

function makeRequest(overrides: Partial<MaintenanceRequest> = {}): MaintenanceRequest {
  return {
    id: "req_1",
    parte: "00002119",
    codigo: null,
    maquina: "COLAMINADORA",
    pieza: null,
    problema: "Fuga de aceite",
    tarea: "Cambiar sello",
    fecha: new Date("2026-09-17T00:00:00.000Z"),
    codemple: null,
    empleado: null,
    estado: "Solicitado",
    responsibleArea: "MANTENIMIENTO",
    commitmentDate: null,
    isHistorical: false,
    createdAt: new Date("2026-09-17T00:00:00.000Z"),
    updatedAt: new Date("2026-09-17T00:00:00.000Z"),
    ...overrides,
  } as MaintenanceRequest;
}

function assertNeverLogged(spy: ReturnType<typeof vi.spyOn>, forbidden: string) {
  for (const call of spy.mock.calls) {
    for (const arg of call) {
      expect(String(arg)).not.toContain(forbidden);
    }
  }
}

/** Respuesta fetch simulada — incluye `.json()` porque el código real ahora siempre intenta leer el body. */
function makeFetchResponse(init: { ok: boolean; status: number; body?: unknown }) {
  return {
    ok: init.ok,
    status: init.status,
    json: async () => init.body ?? {},
  };
}

describe("sendMaintenanceRequestCreatedNotification", () => {
  const originalToken = process.env[TOKEN_KEY];
  const originalChatId = process.env[CHAT_ID_KEY];
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env[TOKEN_KEY];
    else process.env[TOKEN_KEY] = originalToken;
    if (originalChatId === undefined) delete process.env[CHAT_ID_KEY];
    else process.env[CHAT_ID_KEY] = originalChatId;
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("envía la notificación cuando token y chat_id están configurados correctamente (HTTP 200 + body.ok=true)", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;
    fetchMock.mockResolvedValue(
      makeFetchResponse({ ok: true, status: 200, body: { ok: true, result: { message_id: 42 } } }),
    );

    await sendMaintenanceRequestCreatedNotification(makeRequest());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(`https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage`);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe(FAKE_CHAT_ID);
    expect(body.parse_mode).toBe("HTML");
    // PARTE se muestra sin ceros iniciales (formatParteDisplay) en el texto...
    expect(body.text).toContain("2119");
    // ...pero el valor interno nunca se reemplaza: no se usa para construir el link.
    expect(body.text).not.toContain("Fuga de aceite".repeat(2));
    expect(errorSpy).not.toHaveBeenCalled();

    // Registra explícitamente el éxito — antes esto era indistinguible de "nunca se llamó".
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe(
      "[telegram] maintenance_request.created enviado correctamente para PARTE 00002119.",
    );
    assertNeverLogged(logSpy, FAKE_TOKEN);
    assertNeverLogged(logSpy, "api.telegram.org/bot");
  });

  it("omite en silencio (solo warning) cuando falta TELEGRAM_BOT_TOKEN", async () => {
    delete process.env[TOKEN_KEY];
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;

    await sendMaintenanceRequestCreatedNotification(makeRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("omite en silencio (solo warning) cuando falta TELEGRAM_MAINTENANCE_CHAT_ID", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    delete process.env[CHAT_ID_KEY];

    await sendMaintenanceRequestCreatedNotification(makeRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rechaza un chat_id no numérico sin llamar a fetch", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = "no-es-un-chat-id";

    await sendMaintenanceRequestCreatedNotification(makeRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("rechaza un token con formato inválido sin llamar a fetch ni filtrarlo en logs", async () => {
    process.env[TOKEN_KEY] = "no-tiene-el-formato-de-token";
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;

    await sendMaintenanceRequestCreatedNotification(makeRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    assertNeverLogged(warnSpy, "no-tiene-el-formato-de-token");
  });

  it("nunca registra el token (ni la URL de la API que lo contiene) cuando fetch rechaza", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;
    const apiUrl = `https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage`;
    fetchMock.mockRejectedValue(new TypeError(`Failed to parse URL from ${apiUrl}`));

    await sendMaintenanceRequestCreatedNotification(makeRequest());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    assertNeverLogged(errorSpy, FAKE_TOKEN);
    assertNeverLogged(errorSpy, "api.telegram.org/bot");
  });

  it("registra status HTTP y error saneado cuando la API de Telegram responde con status no-2xx", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;
    fetchMock.mockResolvedValue(
      makeFetchResponse({
        ok: false,
        status: 401,
        body: { ok: false, error_code: 401, description: "Unauthorized" },
      }),
    );

    await sendMaintenanceRequestCreatedNotification(makeRequest());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("401");
    expect(errorSpy.mock.calls[0][0]).toContain("Unauthorized");
    expect(logSpy).not.toHaveBeenCalled();
    assertNeverLogged(errorSpy, FAKE_TOKEN);
    assertNeverLogged(errorSpy, "api.telegram.org/bot");
  });

  it("registra error_code y descripción saneada cuando la API responde HTTP 200 pero body.ok=false", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;
    fetchMock.mockResolvedValue(
      makeFetchResponse({
        ok: true,
        status: 200,
        body: { ok: false, error_code: 403, description: "Forbidden: bot was kicked from the group chat" },
      }),
    );

    await sendMaintenanceRequestCreatedNotification(makeRequest());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("body.ok=false");
    expect(errorSpy.mock.calls[0][0]).toContain("403");
    expect(errorSpy.mock.calls[0][0]).toContain("Forbidden: bot was kicked from the group chat");
    // No se registró ningún éxito para este PARTE.
    expect(logSpy).not.toHaveBeenCalled();
    assertNeverLogged(errorSpy, FAKE_TOKEN);
    assertNeverLogged(errorSpy, "api.telegram.org/bot");
  });

  it("nunca lanza: un fallo de Telegram no debe poder hacer fallar al llamador (la importación) ni hacer rollback", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(sendMaintenanceRequestCreatedNotification(makeRequest())).resolves.toBeUndefined();
  });

  it("clasifica un abort (timeout) como 'timeout', sin mensaje crudo", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;
    const abortError = new Error("This operation was aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValue(abortError);

    await sendMaintenanceRequestCreatedNotification(makeRequest());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("timeout");
  });
});

describe("sendTechnicianAssignedNotification", () => {
  const originalToken = process.env[TOKEN_KEY];
  const originalChatId = process.env[CHAT_ID_KEY];
  const originalVercelUrl = process.env.VERCEL_URL;
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Vercel la provee automáticamente en todo deployment real — se fija acá
    // para poder verificar el enlace, que en un entorno sin ella se omite.
    process.env.VERCEL_URL = "simi.example.vercel.app";
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env[TOKEN_KEY];
    else process.env[TOKEN_KEY] = originalToken;
    if (originalChatId === undefined) delete process.env[CHAT_ID_KEY];
    else process.env[CHAT_ID_KEY] = originalChatId;
    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = originalVercelUrl;
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("envía la notificación con el formato esperado cuando token y chat_id están configurados (HTTP 200 + body.ok=true)", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;
    fetchMock.mockResolvedValue(
      makeFetchResponse({ ok: true, status: 200, body: { ok: true, result: { message_id: 7 } } }),
    );

    await sendTechnicianAssignedNotification(makeRequest(), "Benjamin Arzuza");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(`https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage`);
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe(FAKE_CHAT_ID);
    expect(body.parse_mode).toBe("HTML");
    expect(body.text).toContain("ASIGNACIÓN DE MANTENIMIENTO");
    expect(body.text).toContain("Técnico asignado:</b> Benjamin Arzuza");
    // PARTE mostrado sin ceros iniciales (formatParteDisplay)...
    expect(body.text).toContain("PARTE:</b> 2119");
    // ...pero el valor interno (con ceros) es el que arma el enlace.
    expect(body.text).toContain("/solicitudes/00002119");

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toBe("[telegram] technician_assigned enviado correctamente para PARTE 00002119.");
    assertNeverLogged(logSpy, FAKE_TOKEN);
  });

  it("omite en silencio (solo warning) cuando falta configuración de Telegram", async () => {
    delete process.env[TOKEN_KEY];
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;

    await sendTechnicianAssignedNotification(makeRequest(), "Benjamin Arzuza");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("technician_assigned");
  });

  it("registra status HTTP y error saneado cuando la API de Telegram responde con status no-2xx, sin filtrar el token", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;
    fetchMock.mockResolvedValue(
      makeFetchResponse({ ok: false, status: 403, body: { ok: false, error_code: 403, description: "Forbidden" } }),
    );

    await sendTechnicianAssignedNotification(makeRequest(), "Benjamin Arzuza");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("403");
    expect(logSpy).not.toHaveBeenCalled();
    assertNeverLogged(errorSpy, FAKE_TOKEN);
    assertNeverLogged(errorSpy, "api.telegram.org/bot");
  });

  it("nunca lanza: un fallo de Telegram no debe poder afectar a la asignación ya guardada", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(sendTechnicianAssignedNotification(makeRequest(), "Benjamin Arzuza")).resolves.toBeUndefined();
    assertNeverLogged(errorSpy, FAKE_TOKEN);
  });
});

describe("sendTechnicianAssignedDirectNotification — [11] notificación individual al chat privado del técnico", () => {
  const originalToken = process.env[TOKEN_KEY];
  const originalVercelUrl = process.env.VERCEL_URL;
  const FAKE_TECHNICIAN_CHAT_ID = "987654321";
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.VERCEL_URL = "simi.example.vercel.app";
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env[TOKEN_KEY];
    else process.env[TOKEN_KEY] = originalToken;
    if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
    else process.env.VERCEL_URL = originalVercelUrl;
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("envía al chat_id individual del técnico (NUNCA al grupo) con el mismo contenido que el mensaje de grupo (ASIGNACIÓN DE MANTENIMIENTO)", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    fetchMock.mockResolvedValue(
      makeFetchResponse({ ok: true, status: 200, body: { ok: true, result: { message_id: 99 } } }),
    );

    await sendTechnicianAssignedDirectNotification(makeRequest(), "Benjamin Arzuza", FAKE_TECHNICIAN_CHAT_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(`https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage`);
    const body = JSON.parse(init.body);
    // Va al chat privado del técnico, no al chat_id del grupo (TELEGRAM_MAINTENANCE_CHAT_ID
    // ni siquiera está configurada en esta prueba — la función nunca la usa).
    expect(body.chat_id).toBe(FAKE_TECHNICIAN_CHAT_ID);
    expect(body.text).toContain("ASIGNACIÓN DE MANTENIMIENTO");
    expect(body.text).toContain("Técnico asignado:</b> Benjamin Arzuza");
    expect(body.text).toContain("PARTE:</b> 2119");
    expect(body.text).toContain("Máquina:</b> COLAMINADORA");
    expect(body.text).toContain("Estado:</b> Solicitado");
    expect(body.text).toContain("Ver solicitud en SIMI");
    expect(body.text).toContain("/solicitudes/00002119");

    expect(logSpy).toHaveBeenCalledTimes(1);
    assertNeverLogged(logSpy, FAKE_TOKEN);
  });

  it("omite en silencio (solo warning) si TELEGRAM_BOT_TOKEN no está configurado — nunca requiere TELEGRAM_MAINTENANCE_CHAT_ID", async () => {
    delete process.env[TOKEN_KEY];

    await sendTechnicianAssignedDirectNotification(makeRequest(), "Benjamin Arzuza", FAKE_TECHNICIAN_CHAT_ID);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("[12] nunca lanza si Telegram falla — un fallo acá jamás puede revertir una asignación ya guardada", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      sendTechnicianAssignedDirectNotification(makeRequest(), "Benjamin Arzuza", FAKE_TECHNICIAN_CHAT_ID),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("[13] nunca registra el token en ningún log, ni siquiera cuando fetch rechaza con un error que incluye la URL completa", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    const apiUrl = `https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage`;
    fetchMock.mockRejectedValue(new TypeError(`Failed to parse URL from ${apiUrl}`));

    await sendTechnicianAssignedDirectNotification(makeRequest(), "Benjamin Arzuza", FAKE_TECHNICIAN_CHAT_ID);

    assertNeverLogged(errorSpy, FAKE_TOKEN);
    assertNeverLogged(errorSpy, "api.telegram.org/bot");
    assertNeverLogged(logSpy, FAKE_TOKEN);
    assertNeverLogged(warnSpy, FAKE_TOKEN);
  });
});

describe("sendTelegramWebhookReply + builders de texto — respuestas del webhook de vinculación", () => {
  const originalToken = process.env[TOKEN_KEY];
  const FAKE_CHAT_ID_WEBHOOK = "111222333";
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env[TOKEN_KEY];
    else process.env[TOKEN_KEY] = originalToken;
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("buildTelegramLinkSuccessText incluye el nombre del técnico y el texto exacto pedido", () => {
    const text = buildTelegramLinkSuccessText("Benjamin Arzuza");
    expect(text).toBe(
      "✅ Telegram vinculado correctamente con SIMI.\n\nTécnico: Benjamin Arzuza\n\nA partir de ahora SIMI podrá enviarte notificaciones individuales de tus tareas de mantenimiento.",
    );
  });

  it("buildTelegramLinkInvalidCodeText y buildTelegramLinkChatAlreadyLinkedText devuelven el texto exacto pedido", () => {
    expect(buildTelegramLinkInvalidCodeText()).toBe("❌ Código de vinculación inválido o expirado.");
    expect(buildTelegramLinkChatAlreadyLinkedText()).toBe("❌ Este Telegram ya está vinculado a otro técnico.");
  });

  it("sendTelegramWebhookReply envía el texto tal cual al chat_id recibido, sin exigir TELEGRAM_MAINTENANCE_CHAT_ID", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    fetchMock.mockResolvedValue(makeFetchResponse({ ok: true, status: 200, body: { ok: true } }));

    await sendTelegramWebhookReply(FAKE_CHAT_ID_WEBHOOK, buildTelegramLinkSuccessText("Benjamin Arzuza"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe(FAKE_CHAT_ID_WEBHOOK);
    expect(body.text).toContain("Benjamin Arzuza");
  });

  it("[12] nunca lanza si Telegram falla al responder al webhook", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(
      sendTelegramWebhookReply(FAKE_CHAT_ID_WEBHOOK, buildTelegramLinkInvalidCodeText()),
    ).resolves.toBeUndefined();
  });

  it("[13] nunca registra el token, ni siquiera con el token ausente", async () => {
    delete process.env[TOKEN_KEY];

    await sendTelegramWebhookReply(FAKE_CHAT_ID_WEBHOOK, buildTelegramLinkInvalidCodeText());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    assertNeverLogged(warnSpy, FAKE_TOKEN);
  });
});
