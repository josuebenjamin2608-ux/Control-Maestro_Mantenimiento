import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ejercita el route handler real (nunca hace fetch real a Telegram):
 * consumeTechnicianTelegramLinkCode y sendTelegramWebhookReply quedan
 * mockeados, los builders de texto (buildTelegramLinkSuccessText, etc.) se
 * usan reales — son funciones puras sin I/O. Cubre el contrato de
 * seguridad central del endpoint: solo puede llamar a
 * consumeTechnicianTelegramLinkCode con exactamente (texto, chat_id) del
 * update entrante, nunca modifica nada más, y siempre responde 200 salvo
 * que falle la autenticación del secreto.
 */

const { consumeMock, sendReplyMock } = vi.hoisted(() => ({
  consumeMock: vi.fn(),
  sendReplyMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/server/services/technician-telegram-link.service", () => ({
  consumeTechnicianTelegramLinkCode: consumeMock,
}));

vi.mock("@/server/services/telegram.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/services/telegram.service")>();
  return {
    ...actual,
    sendTelegramWebhookReply: sendReplyMock,
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
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env[SECRET_KEY];
    else process.env[SECRET_KEY] = originalSecret;
  });

  it("rechaza con 401 si TELEGRAM_WEBHOOK_SECRET está configurada y el header no coincide", async () => {
    process.env[SECRET_KEY] = "shh-secreto";
    const request = makeRequest(
      { message: { chat: { id: 1, type: "private" }, text: "SIMI-ABC123" } },
      { "x-telegram-bot-api-secret-token": "otro-valor" },
    );

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(consumeMock).not.toHaveBeenCalled();
    expect(sendReplyMock).not.toHaveBeenCalled();
  });

  it("rechaza con 401 si TELEGRAM_WEBHOOK_SECRET está configurada y el header falta", async () => {
    process.env[SECRET_KEY] = "shh-secreto";
    const request = makeRequest({ message: { chat: { id: 1, type: "private" }, text: "SIMI-ABC123" } });

    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it("acepta cuando el header coincide exactamente con TELEGRAM_WEBHOOK_SECRET", async () => {
    process.env[SECRET_KEY] = "shh-secreto";
    consumeMock.mockResolvedValue({ outcome: "invalid_code" });
    const request = makeRequest(
      { message: { chat: { id: 1, type: "private" }, text: "algo" } },
      { "x-telegram-bot-api-secret-token": "shh-secreto" },
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
