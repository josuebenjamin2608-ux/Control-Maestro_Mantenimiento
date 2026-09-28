import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ejercita el route handler real (nunca hace fetch real a Telegram):
 * consumeTechnicianTelegramLinkCode y sendTelegramWebhookReply quedan
 * mockeados, los builders de texto (buildTelegramLinkSuccessText, etc.) se
 * usan reales — son funciones puras sin I/O.
 *
 * SEC-01: el endpoint ahora EXIGE el header `X-Telegram-Bot-Api-Secret-Token`
 * exactamente igual a `TELEGRAM_WEBHOOK_SECRET`, falla CERRADO si la
 * variable no está configurada, y responde 401 sin procesar nada del body
 * en cualquier otro caso. `makeRequest` (helper de este archivo) adjunta
 * por defecto el header CORRECTO — así el resto de las pruebas de este
 * archivo, centradas en lógica de negocio, no necesitan preocuparse por la
 * autenticación; las pruebas de seguridad, más abajo, construyen sus
 * propios requests sin ese helper para poder omitir/alterar el header.
 *
 * SEC-03: "Ver solicitud"/"Historial de atención" (además de "Agregar
 * observación") ahora exigen igual que quien presiona el botón sea un
 * técnico activo con Telegram vinculado — `getActiveTechnicianByTelegramChatId`
 * se mockea explícitamente en cada prueba de callback_query.
 */

const {
  consumeMock,
  sendReplyMock,
  answerCallbackMock,
  answerCallbackAlertMock,
  getByParteMock,
  getActiveTechnicianMock,
  registerObservacionMock,
} = vi.hoisted(() => ({
  consumeMock: vi.fn(),
  sendReplyMock: vi.fn().mockResolvedValue(undefined),
  answerCallbackMock: vi.fn().mockResolvedValue(undefined),
  answerCallbackAlertMock: vi.fn().mockResolvedValue(undefined),
  getByParteMock: vi.fn(),
  getActiveTechnicianMock: vi.fn(),
  registerObservacionMock: vi.fn(),
}));

vi.mock("@/server/services/technician-telegram-link.service", () => ({
  consumeTechnicianTelegramLinkCode: consumeMock,
  getActiveTechnicianByTelegramChatId: getActiveTechnicianMock,
}));

vi.mock("@/server/services/maintenance-requests.service", () => ({
  getMaintenanceRequestByParte: getByParteMock,
}));

vi.mock("@/server/services/telegram-observacion.service", () => ({
  registerObservacionFromTelegram: registerObservacionMock,
}));

vi.mock("@/server/services/telegram.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/telegram.service")>();
  return {
    ...actual,
    sendTelegramWebhookReply: sendReplyMock,
    answerTelegramCallbackQuery: answerCallbackMock,
    answerTelegramCallbackQueryWithAlert: answerCallbackAlertMock,
  };
});

const { POST } = await import("./route");

const SECRET_KEY = "TELEGRAM_WEBHOOK_SECRET";
const SECRET_HEADER = "x-telegram-bot-api-secret-token";
/** Valor de prueba, nunca un secreto real — solo se compara contra sí mismo dentro de este archivo. */
const VALID_SECRET = "test-only-webhook-secret-do-not-leak";
const WEBHOOK_URL = "https://simi.example.vercel.app/api/telegram/webhook";

/** Adjunta por defecto el header del secreto CORRECTO — ver comentario de arriba del archivo. */
function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", [SECRET_HEADER]: VALID_SECRET, ...headers },
    body: JSON.stringify(body),
  });
}

/** Sin ningún header por defecto — para las pruebas de seguridad que necesitan omitirlo/alterarlo explícitamente. */
function makeRequestWithHeaders(body: unknown, headers: Record<string, string>) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const originalSecret = process.env[SECRET_KEY];

beforeEach(() => {
  process.env[SECRET_KEY] = VALID_SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env[SECRET_KEY];
  else process.env[SECRET_KEY] = originalSecret;
});

/**
 * SEC-01: validación del secret_token. Corre ANTES que cualquier otra
 * lógica del endpoint — ninguno de estos casos debe alcanzar a leer el
 * body ni a llamar ningún servicio.
 */
describe("POST /api/telegram/webhook — validación del secret_token (SEC-01)", () => {
  beforeEach(() => {
    consumeMock.mockReset();
    sendReplyMock.mockClear();
    answerCallbackMock.mockClear();
    answerCallbackAlertMock.mockClear();
    getByParteMock.mockReset();
    getActiveTechnicianMock.mockReset();
    registerObservacionMock.mockReset();
  });

  it("[1] sin el header del secreto: responde 401 y nunca procesa el update", async () => {
    const request = makeRequestWithHeaders(
      { message: { chat: { id: 1, type: "private" }, text: "SIMI-ABC123" } },
      {},
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(consumeMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it("[2] header presente pero con un valor incorrecto: responde 401 y nunca procesa el update", async () => {
    const request = makeRequestWithHeaders(
      { message: { chat: { id: 1, type: "private" }, text: "SIMI-ABC123" } },
      { [SECRET_HEADER]: "valor-incorrecto" },
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("TELEGRAM_WEBHOOK_SECRET no configurada: falla CERRADO (401) aunque el request traiga algún header", async () => {
    delete process.env[SECRET_KEY];
    const request = makeRequestWithHeaders(
      { message: { chat: { id: 1, type: "private" }, text: "SIMI-ABC123" } },
      { [SECRET_HEADER]: "cualquier-valor" },
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("TELEGRAM_WEBHOOK_SECRET no configurada y SIN ningún header: también falla CERRADO (401), nunca abierto", async () => {
    delete process.env[SECRET_KEY];
    const request = makeRequestWithHeaders({ message: { chat: { id: 1, type: "private" }, text: "algo" } }, {});

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("[3, 4] header correcto + message: procesa normalmente (comportamiento de negocio sin cambios)", async () => {
    consumeMock.mockResolvedValue({ outcome: "invalid_code" });
    const request = makeRequest({ message: { chat: { id: 1, type: "private" }, text: "SIMI-ABC123" } });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).toHaveBeenCalledWith("SIMI-ABC123", "1");
  });

  it("[3, 5] header correcto + callback_query: procesa normalmente (comportamiento de negocio sin cambios)", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue({ parte: "00002150", maquina: "LOCATIVO", logs: [], assignedTechnicians: [] });
    const request = makeRequest({
      callback_query: {
        id: "cbq_1",
        data: "req:00002150",
        from: { id: 999 },
        message: { chat: { id: 555, type: "private" } },
      },
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(answerCallbackMock).toHaveBeenCalledWith("cbq_1");
    expect(sendReplyMock).toHaveBeenCalledTimes(1);
  });

  it("[11] un callback_query con from.id de un técnico real, pero SIN el secret correcto: se rechaza antes de autorizar o consultar nada", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    const request = makeRequestWithHeaders(
      {
        callback_query: {
          id: "cbq_spoof",
          data: "addobs:00002150",
          from: { id: 999 },
          message: { chat: { id: 555, type: "group" } },
        },
      },
      {},
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(getActiveTechnicianMock).not.toHaveBeenCalled();
    expect(getByParteMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it("nunca registra en logs el valor del secreto (esperado ni recibido) al rechazar un request", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const request = makeRequestWithHeaders(
      { message: { chat: { id: 1, type: "private" }, text: "algo" } },
      { [SECRET_HEADER]: "un-valor-incorrecto-cualquiera" },
    );
    await POST(request);

    for (const spy of [errorSpy, warnSpy, logSpy]) {
      for (const call of spy.mock.calls) {
        for (const arg of call) {
          expect(String(arg)).not.toContain(VALID_SECRET);
          expect(String(arg)).not.toContain("un-valor-incorrecto-cualquiera");
        }
      }
    }
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("el secreto (esperado ni el recibido) nunca aparece en el cuerpo de la respuesta HTTP al rechazar un request", async () => {
    const request = makeRequestWithHeaders(
      { message: { chat: { id: 1, type: "private" }, text: "algo" } },
      { [SECRET_HEADER]: "otro-valor-incorrecto-distinto" },
    );

    const response = await POST(request);
    const bodyText = await response.text();

    expect(response.status).toBe(401);
    expect(bodyText).not.toContain(VALID_SECRET);
    expect(bodyText).not.toContain("otro-valor-incorrecto-distinto");
    // La respuesta de rechazo es un cuerpo fijo y genérico — nunca un eco del request.
    expect(JSON.parse(bodyText)).toEqual({ ok: false });
  });
});

describe("POST /api/telegram/webhook", () => {
  beforeEach(() => {
    consumeMock.mockReset();
    sendReplyMock.mockClear();
    answerCallbackMock.mockClear();
    answerCallbackAlertMock.mockClear();
    getByParteMock.mockReset();
    getActiveTechnicianMock.mockReset();
    registerObservacionMock.mockReset();
  });

  it("ignora mensajes de grupo (chat.type distinto de private) sin llamar al servicio de vinculación", async () => {
    const request = makeRequest({ message: { chat: { id: -100, type: "group" }, text: "SIMI-ABC123" } });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it("ignora updates sin texto (p. ej. sticker) sin llamar al servicio de vinculación", async () => {
    const request = makeRequest({ message: { chat: { id: 1, type: "private" } } });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("ignora updates sin `message` (p. ej. edited_message) sin llamar al servicio de vinculación", async () => {
    const request = makeRequest({ edited_message: { chat: { id: 1, type: "private" }, text: "SIMI-ABC123" } });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("body no-JSON: responde 200 sin lanzar y sin llamar al servicio de vinculación", async () => {
    const request = new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json", [SECRET_HEADER]: VALID_SECRET },
      body: "esto no es JSON",
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("código válido: responde al mismo chat con el mensaje de éxito con el nombre del técnico", async () => {
    consumeMock.mockResolvedValue({ outcome: "linked", technicianId: "tech_1", technicianName: "Benjamin Arzuza" });
    const request = makeRequest({ message: { chat: { id: 555, type: "private" }, text: "SIMI-ABC123" } });

    await POST(request);

    expect(consumeMock).toHaveBeenCalledWith("SIMI-ABC123", "555");
    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    const [chatId, text] = sendReplyMock.mock.calls[0];
    expect(chatId).toBe("555");
    expect(text).toContain("Telegram vinculado correctamente con SIMI");
    expect(text).toContain("Benjamin Arzuza");
  });

  it("código inválido/expirado/usado: responde con el mensaje de rechazo exacto pedido", async () => {
    consumeMock.mockResolvedValue({ outcome: "invalid_code" });
    const request = makeRequest({ message: { chat: { id: 555, type: "private" }, text: "SIMI-NOEXISTE" } });

    await POST(request);

    expect(sendReplyMock).toHaveBeenCalledWith("555", "❌ Código de vinculación inválido o expirado.");
  });

  it("chat ya vinculado a otro técnico: responde con el mensaje de rechazo exacto pedido", async () => {
    consumeMock.mockResolvedValue({ outcome: "chat_already_linked_to_other" });
    const request = makeRequest({ message: { chat: { id: 555, type: "private" }, text: "SIMI-ABC123" } });

    await POST(request);

    expect(sendReplyMock).toHaveBeenCalledWith("555", "❌ Este Telegram ya está vinculado a otro técnico.");
  });

  it("un fallo al enviar la respuesta de Telegram nunca impide responder 200 al webhook", async () => {
    consumeMock.mockResolvedValue({ outcome: "linked", technicianId: "tech_1", technicianName: "Benjamin Arzuza" });
    sendReplyMock.mockRejectedValueOnce(new Error("Telegram caído (prueba)"));
    const request = makeRequest({ message: { chat: { id: 555, type: "private" }, text: "SIMI-ABC123" } });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});

/**
 * Menú interactivo del mensaje de asignación ("Ver solicitud"/"Historial de
 * atención") — SOLO CONSULTA, y desde SEC-03 exige el mismo chequeo de
 * técnico activo vinculado que ya exigía "Agregar observación".
 * getMaintenanceRequestByParte queda mockeado (nunca toca Postgres real
 * acá), pero el route handler real y los builders de texto reales
 * (buildSolicitudQueryText, buildHistorialAtencionQueryText) se ejercitan
 * tal cual. Ninguna de estas pruebas expone un mock de escritura
 * (create/update/delete) sobre Solicitud o Minuta — no hay ningún camino en
 * el código para que este handler modifique una.
 */
describe("POST /api/telegram/webhook — callback_query del menú interactivo", () => {
  beforeEach(() => {
    consumeMock.mockReset();
    sendReplyMock.mockClear();
    answerCallbackMock.mockClear();
    answerCallbackAlertMock.mockClear();
    getByParteMock.mockReset();
    getActiveTechnicianMock.mockReset();
    registerObservacionMock.mockReset();
  });

  function makeCallbackRequest(data: string, chatId = 555, fromId = 999) {
    return makeRequest({
      callback_query: { id: "cbq_1", data, from: { id: fromId }, message: { chat: { id: chatId, type: "private" } } },
    });
  }

  it("[10] [2] técnico vinculado y activo: 'req:<parte>' consulta exactamente ese PARTE y responde con la información de la solicitud", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue({
      parte: "00002150",
      maquina: "LOCATIVO",
      problema: "Ruido",
      tarea: "Revisión",
      estado: "Solicitado",
      fecha: new Date("2026-09-17T00:00:00.000Z"),
      responsibleArea: "MANTENIMIENTO",
      commitmentDate: null,
      assignedTechnicians: [],
      logs: [],
    });
    const request = makeCallbackRequest("req:00002150");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(getActiveTechnicianMock).toHaveBeenCalledWith("999");
    expect(getByParteMock).toHaveBeenCalledWith("00002150");
    expect(answerCallbackMock).toHaveBeenCalledWith("cbq_1");
    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    const [chatId, text] = sendReplyMock.mock.calls[0];
    expect(chatId).toBe("555");
    expect(text).toContain("SOLICITUD 2150");
    expect(text).toContain("LOCATIVO");
  });

  it("[19] 'hist:<parte>' con una Minuta relacionada muestra su observación en el historial de atención", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue({
      parte: "00002150",
      maquina: "LOCATIVO",
      logs: [
        {
          fechaini: new Date("2026-09-22T00:00:00.000Z"),
          fechafin: new Date("2026-09-22T00:00:00.000Z"),
          observaciones: "Se revisa equipo y se identifica desgaste.",
        },
      ],
    });
    const request = makeCallbackRequest("hist:00002150");

    await POST(request);

    const [, text] = sendReplyMock.mock.calls[0];
    expect(text).toContain("HISTORIAL DE ATENCIÓN");
    expect(text).toContain("Se revisa equipo y se identifica desgaste.");
  });

  it("[19] 'hist:<parte>' sin Minutas relacionadas responde el aviso exacto pedido", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue({ parte: "00002150", maquina: "LOCATIVO", logs: [] });
    const request = makeCallbackRequest("hist:00002150");

    await POST(request);

    const [, text] = sendReplyMock.mock.calls[0];
    expect(text).toContain("ℹ️ No hay historial de atención registrado para esta solicitud.");
  });

  it("'obs:<parte>' (callback_data de un mensaje ya enviado antes de este cambio) sigue funcionando como alias de 'hist'", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue({ parte: "00002150", maquina: "LOCATIVO", logs: [] });
    const request = makeCallbackRequest("obs:00002150");

    await POST(request);

    const [, text] = sendReplyMock.mock.calls[0];
    expect(text).toContain("HISTORIAL DE ATENCIÓN");
  });

  it("PARTE inexistente responde el mensaje de 'no encontrada', sin lanzar (solo para un usuario ya autorizado)", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue(null);
    const request = makeCallbackRequest("req:00009999");

    const response = await POST(request);

    expect(response.status).toBe(200);
    const [, text] = sendReplyMock.mock.calls[0];
    expect(text).toContain("No se encontró la solicitud");
  });

  it("siempre confirma el callback_query (answerCallbackQuery) aunque no se pueda responder en el chat", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue(null);
    sendReplyMock.mockRejectedValueOnce(new Error("Telegram caído (prueba)"));
    const request = makeCallbackRequest("req:00002150");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(answerCallbackMock).toHaveBeenCalledWith("cbq_1");
  });

  it("confirma el callback_query incluso sin `message` (mensaje original demasiado viejo), sin intentar responder en ningún chat ni consultar autorización", async () => {
    const request = makeRequest({ callback_query: { id: "cbq_2", data: "req:00002150", from: { id: 999 } } });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(answerCallbackMock).toHaveBeenCalledWith("cbq_2");
    expect(getActiveTechnicianMock).not.toHaveBeenCalled();
    expect(getByParteMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it("callback_data no reconocido: confirma el callback_query, pero no consulta autorización ni nada más", async () => {
    const request = makeCallbackRequest("algo-desconocido");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(answerCallbackMock).toHaveBeenCalledWith("cbq_1");
    expect(getActiveTechnicianMock).not.toHaveBeenCalled();
    expect(getByParteMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it("un callback_query nunca invoca consumeTechnicianTelegramLinkCode (esa ruta es exclusiva de mensajes de texto)", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue(null);
    const request = makeCallbackRequest("req:00002150");

    await POST(request);

    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("[7] [12] usuario NO autorizado (no vinculado o inactivo): 'req:<parte>' responde con alerta genérica y NUNCA consulta la Solicitud (no revela si el PARTE existe)", async () => {
    getActiveTechnicianMock.mockResolvedValue(null);
    const request = makeCallbackRequest("req:00002150");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(answerCallbackAlertMock).toHaveBeenCalledTimes(1);
    expect(answerCallbackAlertMock.mock.calls[0][0]).toBe("cbq_1");
    expect(getByParteMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
    expect(answerCallbackMock).not.toHaveBeenCalled();
  });

  it("[8] [12] usuario NO autorizado: 'hist:<parte>' responde con la misma alerta genérica y NUNCA consulta el historial", async () => {
    getActiveTechnicianMock.mockResolvedValue(null);
    const request = makeCallbackRequest("hist:00002150");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(answerCallbackAlertMock).toHaveBeenCalledTimes(1);
    expect(getByParteMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it("[12] la alerta de no autorizado es genérica: no menciona el PARTE ni revela si la Solicitud existe o no", async () => {
    getActiveTechnicianMock.mockResolvedValue(null);
    const request = makeCallbackRequest("req:00002150");

    await POST(request);

    const [, alertText] = answerCallbackAlertMock.mock.calls[0];
    expect(alertText).not.toContain("2150");
    expect(alertText).not.toContain("00002150");
    expect(alertText).not.toMatch(/no se encontr/i);
  });

  it("misma alerta genérica para las 3 acciones (req/hist/addobs) cuando no está autorizado — nunca revela cuál botón se presionó", async () => {
    getActiveTechnicianMock.mockResolvedValue(null);

    await POST(makeCallbackRequest("req:00002150"));
    const reqAlert = answerCallbackAlertMock.mock.calls[0][1];
    answerCallbackAlertMock.mockClear();

    await POST(makeCallbackRequest("hist:00002150"));
    const histAlert = answerCallbackAlertMock.mock.calls[0][1];
    answerCallbackAlertMock.mockClear();

    await POST(makeRequest({
      callback_query: { id: "cbq_3", data: "addobs:00002150", from: { id: 999 }, message: { chat: { id: 555, type: "private" } } },
    }));
    const addobsAlert = answerCallbackAlertMock.mock.calls[0][1];

    expect(reqAlert).toBe(histAlert);
    expect(histAlert).toBe(addobsAlert);
  });
});

/**
 * "Agregar observación" — botón (callback_query): SOLO autoriza y envía el
 * prompt de force_reply; NUNCA llama a registerObservacionFromTelegram. La
 * autorización reutiliza EXACTAMENTE el mecanismo existente de vinculación
 * (getActiveTechnicianByTelegramChatId por `callback_query.from.id`) —
 * ningún mock de sistema de usuarios nuevo aparece acá porque no existe.
 */
describe("POST /api/telegram/webhook — callback_query 'addobs:<parte>' (Agregar observación)", () => {
  beforeEach(() => {
    consumeMock.mockReset();
    sendReplyMock.mockClear();
    answerCallbackMock.mockClear();
    answerCallbackAlertMock.mockClear();
    getByParteMock.mockReset();
    getActiveTechnicianMock.mockReset();
    registerObservacionMock.mockReset();
  });

  function makeObservacionCallbackRequest(parte: string, chatId = 555, fromId = 999) {
    return makeRequest({
      callback_query: {
        id: "cbq_obs",
        data: `addobs:${parte}`,
        from: { id: fromId },
        message: { chat: { id: chatId, type: "group" } },
      },
    });
  }

  it("[1, 2] identifica correctamente el PARTE del callback_data (botón 'Agregar observación') y consulta la Solicitud exacta", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue({ parte: "00002161", maquina: "LOCATIVO", logs: [] });
    const request = makeObservacionCallbackRequest("00002161");

    await POST(request);

    expect(getActiveTechnicianMock).toHaveBeenCalledWith("999");
    expect(getByParteMock).toHaveBeenCalledWith("00002161");
  });

  it("[3] técnico autorizado: envía el prompt AGREGAR OBSERVACIÓN con force_reply (crea el contexto pendiente para ese chat/usuario)", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue({ parte: "00002161", maquina: "LOCATIVO", logs: [] });
    const request = makeObservacionCallbackRequest("00002161");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(answerCallbackMock).toHaveBeenCalledWith("cbq_obs");
    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    const [chatId, text, replyMarkup] = sendReplyMock.mock.calls[0];
    expect(chatId).toBe("555");
    expect(text).toContain("AGREGAR OBSERVACIÓN");
    expect(text).toContain("SOLICITUD 2161");
    expect(text).toContain("PARTE: 00002161");
    expect(replyMarkup).toEqual({ force_reply: true, selective: true });
    expect(registerObservacionMock).not.toHaveBeenCalled();
  });

  it("[8] PARTE inexistente: responde 'no encontrada' y nunca envía el prompt de force_reply (nunca crea contexto pendiente para un PARTE que no existe)", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue(null);
    const request = makeObservacionCallbackRequest("00009999");

    await POST(request);

    const [, text, replyMarkup] = sendReplyMock.mock.calls[0];
    expect(text).toContain("No se encontró la solicitud");
    expect(replyMarkup).toBeUndefined();
  });

  it("[6] [9] usuario NO autorizado (Telegram no vinculado a un técnico activo): responde con alerta genérica y nunca envía el prompt ni consulta la Solicitud", async () => {
    getActiveTechnicianMock.mockResolvedValue(null);
    const request = makeObservacionCallbackRequest("00002161");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(answerCallbackAlertMock).toHaveBeenCalledTimes(1);
    expect(answerCallbackAlertMock.mock.calls[0][0]).toBe("cbq_obs");
    expect(answerCallbackMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
    expect(getByParteMock).not.toHaveBeenCalled();
  });

  it("funciona igual si el botón se presiona desde el chat privado del técnico (no solo desde el grupo)", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    getByParteMock.mockResolvedValue({ parte: "00002161", maquina: "LOCATIVO", logs: [] });
    const request = makeRequest({
      callback_query: {
        id: "cbq_obs_priv",
        data: "addobs:00002161",
        from: { id: 999 },
        message: { chat: { id: 999, type: "private" } },
      },
    });

    await POST(request);

    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    expect(sendReplyMock.mock.calls[0][0]).toBe("999");
  });
});

/**
 * "Agregar observación" — mensaje de texto que responde (reply_to_message)
 * al prompt: el ÚNICO lugar donde este endpoint llama a
 * registerObservacionFromTelegram (telegram-observacion.service.ts).
 * Reconocido de forma completamente stateless a partir del texto exacto
 * que Telegram devuelve en `reply_to_message.text` — nunca de un campo de
 * estado guardado en SIMI (el "contexto pendiente" pedido en el punto 3 de
 * la especificación es, precisamente, ese `reply_to_message`).
 */
describe("POST /api/telegram/webhook — mensaje que responde al prompt de Agregar observación", () => {
  beforeEach(() => {
    consumeMock.mockReset();
    sendReplyMock.mockClear();
    answerCallbackMock.mockClear();
    answerCallbackAlertMock.mockClear();
    getByParteMock.mockReset();
    getActiveTechnicianMock.mockReset();
    registerObservacionMock.mockReset();
  });

  const PROMPT_TEXT_2161 =
    "📝 AGREGAR OBSERVACIÓN – SOLICITUD 2161\nPARTE: 00002161\n\nEscribe la observación o avance de la tarea.";
  const PROMPT_TEXT_9999 =
    "📝 AGREGAR OBSERVACIÓN – SOLICITUD 9999\nPARTE: 00009999\n\nEscribe la observación o avance de la tarea.";

  function makeObservacionReplyRequest(
    text: string,
    opts: { chatId?: number; chatType?: string; fromId?: number; replyText?: string | null } = {},
  ) {
    const { chatId = -100, chatType = "group", fromId = 999, replyText = PROMPT_TEXT_2161 } = opts;
    return makeRequest({
      message: {
        chat: { id: chatId, type: chatType },
        text,
        from: { id: fromId },
        ...(replyText !== null ? { reply_to_message: { text: replyText } } : {}),
      },
    });
  }

  it("[3, 4, 5] el próximo mensaje de texto se interpreta como observación y se asocia a la Solicitud correcta (PARTE recuperado del prompt, contexto pendiente stateless)", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    registerObservacionMock.mockResolvedValue({ outcome: "registered", maquina: "LOCATIVO" });
    const request = makeObservacionReplyRequest(
      "Se revisó la máquina. Se requiere cambio de manija. Repuesto enviado a taller metalmecánico, pendiente de entrega.",
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(registerObservacionMock).toHaveBeenCalledWith({
      parte: "00002161",
      texto:
        "Se revisó la máquina. Se requiere cambio de manija. Repuesto enviado a taller metalmecánico, pendiente de entrega.",
      technician: { employeeCode: "E1", fullName: "Benjamin Arzuza" },
    });
  });

  it("[8] una observación respondida al prompt de una PARTE nunca puede terminar asociada a otra PARTE distinta", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    registerObservacionMock.mockResolvedValue({ outcome: "registered", maquina: "LOCATIVO" });

    await POST(makeObservacionReplyRequest("Observación para 2161", { replyText: PROMPT_TEXT_2161 }));
    await POST(makeObservacionReplyRequest("Observación para 9999", { replyText: PROMPT_TEXT_9999 }));

    expect(registerObservacionMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ parte: "00002161", texto: "Observación para 2161" }),
    );
    expect(registerObservacionMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ parte: "00009999", texto: "Observación para 9999" }),
    );
  });

  it("[9] confirma con el texto exacto pedido, mostrando PARTE y el texto de la observación", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    registerObservacionMock.mockResolvedValue({ outcome: "registered", maquina: "LOCATIVO" });
    const request = makeObservacionReplyRequest(
      "Se revisó la máquina. Se requiere cambio de manija. Repuesto enviado a taller metalmecánico, pendiente de entrega.",
    );

    await POST(request);

    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    const [chatId, text] = sendReplyMock.mock.calls[0];
    expect(chatId).toBe("-100");
    expect(text).toContain("Observación registrada");
    expect(text).toContain("PARTE: 2161");
    expect(text).toContain(
      "Se revisó la máquina. Se requiere cambio de manija. Repuesto enviado a taller metalmecánico, pendiente de entrega.",
    );
  });

  it("PARTE inexistente (la Solicitud fue eliminada entre el prompt y la respuesta): nunca crea nada, responde 'no encontrada'", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    registerObservacionMock.mockResolvedValue({ outcome: "solicitud_not_found" });
    const request = makeObservacionReplyRequest("Texto cualquiera");

    await POST(request);

    const [, text] = sendReplyMock.mock.calls[0];
    expect(text).toContain("No se encontró la solicitud");
  });

  it("responde desde el chat privado del técnico igual que desde el grupo", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    registerObservacionMock.mockResolvedValue({ outcome: "registered", maquina: "LOCATIVO" });
    const request = makeObservacionReplyRequest("Observación desde el privado", { chatId: 999, chatType: "private" });

    await POST(request);

    expect(registerObservacionMock).toHaveBeenCalledTimes(1);
    expect(sendReplyMock.mock.calls[0][0]).toBe("999");
  });

  it("[6] usuario NO autorizado que responde al prompt ajeno: se ignora, nunca crea una Minuta ni confunde con el flujo de vinculación", async () => {
    getActiveTechnicianMock.mockResolvedValue(null);
    const request = makeObservacionReplyRequest("Intento de otro miembro del grupo");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(registerObservacionMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("mensaje vacío (tras el trim): NO se acepta, responde indicando que debe escribir una observación, sin crear nada", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    const request = makeObservacionReplyRequest("   ");

    await POST(request);

    expect(registerObservacionMock).not.toHaveBeenCalled();
    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    const [, text] = sendReplyMock.mock.calls[0];
    expect(text.toLowerCase()).toContain("observación");
  });

  it("'cancelar' cancela el flujo: responde el texto exacto pedido y limpia el contexto pendiente sin crear ninguna observación", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    const request = makeObservacionReplyRequest("cancelar");

    await POST(request);

    expect(registerObservacionMock).not.toHaveBeenCalled();
    expect(sendReplyMock).toHaveBeenCalledWith("-100", "Operación cancelada. No se registró ninguna observación.");
  });

  it("'/cancelar' también cancela, sin distinguir mayúsculas ni espacios", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    const request = makeObservacionReplyRequest("  /CANCELAR  ");

    await POST(request);

    expect(registerObservacionMock).not.toHaveBeenCalled();
    expect(sendReplyMock).toHaveBeenCalledWith("-100", "Operación cancelada. No se registró ninguna observación.");
  });

  it("un mensaje privado normal (código de vinculación, sin reply_to_message) sigue funcionando exactamente igual", async () => {
    getActiveTechnicianMock.mockResolvedValue(null);
    consumeMock.mockResolvedValue({ outcome: "invalid_code" });
    const request = makeRequest({ message: { chat: { id: 555, type: "private" }, text: "SIMI-ABC123" } });

    await POST(request);

    expect(consumeMock).toHaveBeenCalledWith("SIMI-ABC123", "555");
    expect(registerObservacionMock).not.toHaveBeenCalled();
    expect(getActiveTechnicianMock).not.toHaveBeenCalled();
  });

  it("un mensaje de grupo normal (sin reply_to_message al prompt de observación) se sigue ignorando igual que antes", async () => {
    getActiveTechnicianMock.mockResolvedValue(null);
    const request = makeObservacionReplyRequest("Mensaje cualquiera del grupo", { chatId: -100, replyText: null });

    await POST(request);

    expect(registerObservacionMock).not.toHaveBeenCalled();
    expect(consumeMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it("una respuesta (reply) a un mensaje cualquiera que NO es el prompt de observación nunca se interpreta como observación", async () => {
    getActiveTechnicianMock.mockResolvedValue({ id: "t1", employeeCode: "E1", fullName: "Benjamin Arzuza" });
    const request = makeObservacionReplyRequest("Cita un mensaje cualquiera", {
      replyText: "Hola, este es otro mensaje.",
    });

    await POST(request);

    expect(registerObservacionMock).not.toHaveBeenCalled();
  });
});
