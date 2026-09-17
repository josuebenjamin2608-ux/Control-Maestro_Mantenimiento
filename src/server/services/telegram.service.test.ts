import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MaintenanceRequest } from "@/generated/prisma/client";
import { sendMaintenanceRequestCreatedNotification } from "./telegram.service";

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

describe("sendMaintenanceRequestCreatedNotification", () => {
  const originalToken = process.env[TOKEN_KEY];
  const originalChatId = process.env[CHAT_ID_KEY];
  let fetchMock: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env[TOKEN_KEY];
    else process.env[TOKEN_KEY] = originalToken;
    if (originalChatId === undefined) delete process.env[CHAT_ID_KEY];
    else process.env[CHAT_ID_KEY] = originalChatId;
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("envía la notificación cuando token y chat_id están configurados correctamente", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

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

  it("nunca registra el token cuando la API de Telegram responde con status no-2xx", async () => {
    process.env[TOKEN_KEY] = FAKE_TOKEN;
    process.env[CHAT_ID_KEY] = FAKE_CHAT_ID;
    fetchMock.mockResolvedValue({ ok: false, status: 401 });

    await sendMaintenanceRequestCreatedNotification(makeRequest());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("401");
    assertNeverLogged(errorSpy, FAKE_TOKEN);
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
