import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ejercita el route handler real (nunca hace fetch real a Telegram):
 * consumeTechnicianTelegramLinkCode y sendTelegramWebhookReply quedan
 * mockeados, los builders de texto (buildTelegramLinkSuccessText, etc.) se
 * usan reales — son funciones puras sin I/O. Cubre el contrato de
 * seguridad central del endpoint: solo puede llamar a
 * consumeTechnicianTelegramLinkCode con exactamente (texto, chat_id) del
 * update entrante, nunca modifica nada más, y siempre responde 200. No hay
 * chequeo del header X-Telegram-Bot-Api-Secret-Token (se quitó porque
 * bloqueaba en producción todos los updates reales de Telegram — ver
 * comentario en route.ts) — estas pruebas confirman que el endpoint
 * procesa normalmente sin importar la presencia/valor de ese header ni de
 * TELEGRAM_WEBHOOK_SECRET.
 */

const { consumeMock, sendReplyMock, answerCallbackMock, getByParteMock } = vi.hoisted(() => ({
  consumeMock: vi.fn(),
  sendReplyMock: vi.fn().mockResolvedValue(undefined),
  answerCallbackMock: vi.fn().mockResolvedValue(undefined),
  getByParteMock: vi.fn(),
}));

vi.mock("@/server/services/technician-telegram-link.service", () => ({
  consumeTechnicianTelegramLinkCode: consumeMock,
}));

vi.mock("@/server/services/maintenance-requests.service", () => ({
  getMaintenanceRequestByParte: getByParteMock,
}));

vi.mock("@/server/services/telegram.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/telegram.service")>();
  return {
    ...actual,
    sendTelegramWebhookReply: sendReplyMock,
    answerTelegramCallbackQuery: answerCallbackMock,
  };
});

const { POST } = await import("./route");

const SECRET_KEY = "TELEGRAM_WEBHOOK_SECRET";
const WEBHOOK_URL = "https://simi.example.vercel.app/api/telegram/webhook";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request(WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/telegram/webhook", () => {
  const originalSecret = process.env[SECRET_KEY];

  beforeEach(() => {
    consumeMock.mockReset();
    sendReplyMock.mockClear();
    answerCallbackMock.mockClear();
    getByParteMock.mockReset();
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env[SECRET_KEY];
    else process.env[SECRET_KEY] = originalSecret;
  });

  it("procesa el update normalmente aunque falte el header X-Telegram-Bot-Api-Secret-Token, incluso con TELEGRAM_WEBHOOK_SECRET configurada", async () => {
    process.env[SECRET_KEY] = "shh-secreto";
    consumeMock.mockResolvedValue({ outcome: "invalid_code" });
    const request = makeRequest({ message: { chat: { id: 1, type: "private" }, text: "SIMI-ABC123" } });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).toHaveBeenCalledWith("SIMI-ABC123", "1");
  });

  it("procesa el update normalmente aunque el header no coincida con TELEGRAM_WEBHOOK_SECRET", async () => {
    process.env[SECRET_KEY] = "shh-secreto";
    consumeMock.mockResolvedValue({ outcome: "invalid_code" });
    const request = makeRequest(
      { message: { chat: { id: 1, type: "private" }, text: "algo" } },
      { "x-telegram-bot-api-secret-token": "otro-valor" },
    );

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).toHaveBeenCalledWith("algo", "1");
  });

  it("procesa sin exigir el header cuando TELEGRAM_WEBHOOK_SECRET no está configurada", async () => {
    delete process.env[SECRET_KEY];
    consumeMock.mockResolvedValue({ outcome: "invalid_code" });
    const request = makeRequest({ message: { chat: { id: 1, type: "private" }, text: "algo" } });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).toHaveBeenCalledTimes(1);
  });

  it("ignora mensajes de grupo (chat.type distinto de private) sin llamar al servicio de vinculación", async () => {
    delete process.env[SECRET_KEY];
    const request = makeRequest({ message: { chat: { id: -100, type: "group" }, text: "SIMI-ABC123" } });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it("ignora updates sin texto (p. ej. sticker) sin llamar al servicio de vinculación", async () => {
    delete process.env[SECRET_KEY];
    const request = makeRequest({ message: { chat: { id: 1, type: "private" } } });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("ignora updates sin `message` (p. ej. edited_message) sin llamar al servicio de vinculación", async () => {
    delete process.env[SECRET_KEY];
    const request = makeRequest({ edited_message: { chat: { id: 1, type: "private" }, text: "SIMI-ABC123" } });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("body no-JSON: responde 200 sin lanzar y sin llamar al servicio de vinculación", async () => {
    delete process.env[SECRET_KEY];
    const request = new Request(WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "esto no es JSON",
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("código válido: responde al mismo chat con el mensaje de éxito con el nombre del técnico", async () => {
    delete process.env[SECRET_KEY];
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
    delete process.env[SECRET_KEY];
    consumeMock.mockResolvedValue({ outcome: "invalid_code" });
    const request = makeRequest({ message: { chat: { id: 555, type: "private" }, text: "SIMI-NOEXISTE" } });

    await POST(request);

    expect(sendReplyMock).toHaveBeenCalledWith("555", "❌ Código de vinculación inválido o expirado.");
  });

  it("chat ya vinculado a otro técnico: responde con el mensaje de rechazo exacto pedido", async () => {
    delete process.env[SECRET_KEY];
    consumeMock.mockResolvedValue({ outcome: "chat_already_linked_to_other" });
    const request = makeRequest({ message: { chat: { id: 555, type: "private" }, text: "SIMI-ABC123" } });

    await POST(request);

    expect(sendReplyMock).toHaveBeenCalledWith("555", "❌ Este Telegram ya está vinculado a otro técnico.");
  });

  it("un fallo al enviar la respuesta de Telegram nunca impide responder 200 al webhook", async () => {
    delete process.env[SECRET_KEY];
    consumeMock.mockResolvedValue({ outcome: "linked", technicianId: "tech_1", technicianName: "Benjamin Arzuza" });
    sendReplyMock.mockRejectedValueOnce(new Error("Telegram caído (prueba)"));
    const request = makeRequest({ message: { chat: { id: 555, type: "private" }, text: "SIMI-ABC123" } });

    const response = await POST(request);

    expect(response.status).toBe(200);
  });
});

/**
 * Menú interactivo del mensaje de asignación ("Ver solicitud"/"Ver
 * observaciones") — SOLO CONSULTA: getMaintenanceRequestByParte queda
 * mockeado (nunca toca Postgres real acá), pero el route handler real y
 * los builders de texto reales (buildSolicitudQueryText,
 * buildObservacionesQueryText) se ejercitan tal cual. Ninguna de estas
 * pruebas expone un mock de escritura (create/update/delete) sobre
 * Solicitud o Minuta — no hay ningún camino en el código para que este
 * handler modifique una, y estas pruebas lo confirman por construcción: si
 * el handler intentara escribir, no habría ningún mock que lo permitiera.
 */
describe("POST /api/telegram/webhook — callback_query del menú interactivo", () => {
  beforeEach(() => {
    consumeMock.mockReset();
    sendReplyMock.mockClear();
    answerCallbackMock.mockClear();
    getByParteMock.mockReset();
  });

  function makeCallbackRequest(data: string, chatId = 555) {
    return makeRequest({
      callback_query: { id: "cbq_1", data, message: { chat: { id: chatId, type: "private" } } },
    });
  }

  it("[2] 'req:<parte>' consulta exactamente ese PARTE y responde con la información de la solicitud", async () => {
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
    expect(getByParteMock).toHaveBeenCalledWith("00002150");
    expect(answerCallbackMock).toHaveBeenCalledWith("cbq_1");
    expect(sendReplyMock).toHaveBeenCalledTimes(1);
    const [chatId, text] = sendReplyMock.mock.calls[0];
    expect(chatId).toBe("555");
    expect(text).toContain("SOLICITUD 2150");
    expect(text).toContain("LOCATIVO");
  });

  it("[4] 'obs:<parte>' con una Minuta relacionada muestra su observación", async () => {
    getByParteMock.mockResolvedValue({
      parte: "00002150",
      logs: [
        {
          fechaini: new Date("2026-09-22T00:00:00.000Z"),
          fechafin: new Date("2026-09-22T00:00:00.000Z"),
          observaciones: "Se revisa equipo y se identifica desgaste.",
        },
      ],
    });
    const request = makeCallbackRequest("obs:00002150");

    await POST(request);

    const [, text] = sendReplyMock.mock.calls[0];
    expect(text).toContain("Se revisa equipo y se identifica desgaste.");
  });

  it("[7] 'obs:<parte>' sin Minutas relacionadas responde el aviso exacto pedido", async () => {
    getByParteMock.mockResolvedValue({ parte: "00002150", logs: [] });
    const request = makeCallbackRequest("obs:00002150");

    await POST(request);

    const [, text] = sendReplyMock.mock.calls[0];
    expect(text).toContain("ℹ️ No hay observaciones registradas para esta solicitud.");
  });

  it("PARTE inexistente responde el mensaje de 'no encontrada', sin lanzar", async () => {
    getByParteMock.mockResolvedValue(null);
    const request = makeCallbackRequest("req:00009999");

    const response = await POST(request);

    expect(response.status).toBe(200);
    const [, text] = sendReplyMock.mock.calls[0];
    expect(text).toContain("No se encontró la solicitud");
  });

  it("siempre confirma el callback_query (answerCallbackQuery) aunque no se pueda responder en el chat", async () => {
    getByParteMock.mockResolvedValue(null);
    sendReplyMock.mockRejectedValueOnce(new Error("Telegram caído (prueba)"));
    const request = makeCallbackRequest("req:00002150");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(answerCallbackMock).toHaveBeenCalledWith("cbq_1");
  });

  it("confirma el callback_query incluso sin `message` (mensaje original demasiado viejo), sin intentar responder en ningún chat", async () => {
    const request = makeRequest({ callback_query: { id: "cbq_2", data: "req:00002150" } });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(answerCallbackMock).toHaveBeenCalledWith("cbq_2");
    expect(getByParteMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it("callback_data no reconocido: confirma el callback_query, pero no consulta nada ni responde en el chat", async () => {
    const request = makeCallbackRequest("algo-desconocido");

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(answerCallbackMock).toHaveBeenCalledWith("cbq_1");
    expect(getByParteMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it("un callback_query nunca invoca consumeTechnicianTelegramLinkCode (esa ruta es exclusiva de mensajes de texto)", async () => {
    getByParteMock.mockResolvedValue(null);
    const request = makeCallbackRequest("req:00002150");

    await POST(request);

    expect(consumeMock).not.toHaveBeenCalled();
  });
});
