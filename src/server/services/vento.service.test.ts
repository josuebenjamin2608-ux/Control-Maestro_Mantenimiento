import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MaintenanceRequest } from "@/generated/prisma/client";
import { sendMaintenanceRequestCreatedEvent } from "./vento.service";

const ENV_KEY = "VENTO_MAINTENANCE_REQUEST_CREATED_URL";
const ENABLED_KEY = "VENTO_ENABLED";

/** PARTE deliberadamente reconocible en los asserts de "no se filtra en logs". */
const SECRET_TOKEN = "SECRET_TOKEN_DO_NOT_LEAK";

function makeRequest(overrides: Partial<MaintenanceRequest> = {}): MaintenanceRequest {
  return {
    id: "req_1",
    parte: "00001234",
    codigo: null,
    maquina: "COLAMINADORA",
    pieza: null,
    problema: "Fuga de aceite",
    tarea: "Cambiar sello",
    fecha: new Date("2026-09-17T00:00:00.000Z"),
    codemple: null,
    empleado: null,
    estado: "Solicitado",
    responsibleArea: null,
    commitmentDate: null,
    isHistorical: false,
    createdAt: new Date("2026-09-17T00:00:00.000Z"),
    updatedAt: new Date("2026-09-17T00:00:00.000Z"),
    ...overrides,
  } as MaintenanceRequest;
}

/** Ningún argumento pasado a console.error/warn debe contener este substring. */
function assertNeverLogged(spy: ReturnType<typeof vi.spyOn>, forbidden: string) {
  for (const call of spy.mock.calls) {
    for (const arg of call) {
      expect(String(arg)).not.toContain(forbidden);
    }
  }
}

describe("sendMaintenanceRequestCreatedEvent", () => {
  const originalEnv = process.env[ENV_KEY];
  const originalEnabled = process.env[ENABLED_KEY];
  let fetchMock: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Todas las pruebas de este describe ejercen el comportamiento con la
    // integración habilitada (VENTO_ENABLED="true"); el describe siguiente
    // cubre específicamente el estado deshabilitado (feature flag).
    process.env[ENABLED_KEY] = "true";
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
    if (originalEnabled === undefined) delete process.env[ENABLED_KEY];
    else process.env[ENABLED_KEY] = originalEnabled;
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("envía el evento cuando VENTO_ENABLED='true' y la URL es https válida (conserva el comportamiento actual)", async () => {
    process.env[ENV_KEY] = `https://cloud.vento.build/webhook?token=${SECRET_TOKEN}`;
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await sendMaintenanceRequestCreatedEvent(makeRequest());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(`https://cloud.vento.build/webhook?token=${SECRET_TOKEN}`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toMatchObject({
      event: "maintenance_request.created",
      parte: "00001234",
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("no envía nada y omite en silencio cuando la variable no está configurada", async () => {
    delete process.env[ENV_KEY];

    await sendMaintenanceRequestCreatedEvent(makeRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rechaza una URL con protocolo http (no https) sin llamar a fetch", async () => {
    process.env[ENV_KEY] = `http://cloud.vento.build/webhook?token=${SECRET_TOKEN}`;

    await sendMaintenanceRequestCreatedEvent(makeRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    assertNeverLogged(errorSpy, SECRET_TOKEN);
    assertNeverLogged(errorSpy, "cloud.vento.build");
  });

  it('rechaza una URL con el prefijo accidental "POST " sin llamar a fetch ni filtrar la URL/token', async () => {
    process.env[ENV_KEY] = `POST https://cloud.vento.build/webhook?token=${SECRET_TOKEN}`;

    await sendMaintenanceRequestCreatedEvent(makeRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    assertNeverLogged(errorSpy, SECRET_TOKEN);
    assertNeverLogged(errorSpy, "cloud.vento.build");
    assertNeverLogged(errorSpy, "POST https://");
  });

  it("rechaza un valor que no es una URL en absoluto, sin llamar a fetch", async () => {
    process.env[ENV_KEY] = "no-es-una-url";

    await sendMaintenanceRequestCreatedEvent(makeRequest());

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("nunca registra el token ni la URL cuando fetch rechaza (error de red)", async () => {
    const url = `https://cloud.vento.build/webhook?token=${SECRET_TOKEN}`;
    process.env[ENV_KEY] = url;
    fetchMock.mockRejectedValue(new TypeError(`Failed to parse URL from ${url}`));

    await sendMaintenanceRequestCreatedEvent(makeRequest());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    assertNeverLogged(errorSpy, SECRET_TOKEN);
    assertNeverLogged(errorSpy, "cloud.vento.build");
  });

  it("nunca registra el token ni la URL cuando fetch responde con status no-2xx", async () => {
    const url = `https://cloud.vento.build/webhook?token=${SECRET_TOKEN}`;
    process.env[ENV_KEY] = url;
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await sendMaintenanceRequestCreatedEvent(makeRequest());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("500");
    assertNeverLogged(errorSpy, SECRET_TOKEN);
    assertNeverLogged(errorSpy, "cloud.vento.build");
  });

  it("nunca lanza: un fallo del webhook no debe poder hacer fallar al llamador (la importación)", async () => {
    process.env[ENV_KEY] = "https://cloud.vento.build/webhook";
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(sendMaintenanceRequestCreatedEvent(makeRequest())).resolves.toBeUndefined();
  });

  it("clasifica un abort (timeout) como 'timeout', sin mensaje crudo", async () => {
    process.env[ENV_KEY] = "https://cloud.vento.build/webhook";
    const abortError = new Error("This operation was aborted");
    abortError.name = "AbortError";
    fetchMock.mockRejectedValue(abortError);

    await sendMaintenanceRequestCreatedEvent(makeRequest());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain("timeout");
  });
});

describe("sendMaintenanceRequestCreatedEvent — feature flag VENTO_ENABLED", () => {
  const originalEnv = process.env[ENV_KEY];
  const originalEnabled = process.env[ENABLED_KEY];
  let fetchMock: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Con la integración habilitada, esta URL enviaría correctamente (ver
    // describe anterior) — así cada prueba de este bloque demuestra que el
    // flag corta el flujo ANTES de llegar a la validación de URL/fetch,
    // no que el envío haya fallado por otro motivo.
    process.env[ENV_KEY] = `https://cloud.vento.build/webhook?token=${SECRET_TOKEN}`;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
    if (originalEnabled === undefined) delete process.env[ENABLED_KEY];
    else process.env[ENABLED_KEY] = originalEnabled;
    vi.unstubAllGlobals();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("no llama a fetch ni loggea nada cuando VENTO_ENABLED no está definida", async () => {
    delete process.env[ENABLED_KEY];

    await expect(sendMaintenanceRequestCreatedEvent(makeRequest())).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("no llama a fetch ni loggea nada cuando VENTO_ENABLED='false'", async () => {
    process.env[ENABLED_KEY] = "false";

    await expect(sendMaintenanceRequestCreatedEvent(makeRequest())).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("no llama a fetch con ningún valor distinto de la cadena exacta 'true' (p. ej. 'TRUE' o '1')", async () => {
    for (const value of ["TRUE", "1", "yes", " true"]) {
      fetchMock.mockClear();
      process.env[ENABLED_KEY] = value;

      await sendMaintenanceRequestCreatedEvent(makeRequest());

      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("una solicitud NEW no se ve afectada: la función resuelve sin lanzar aunque Vento esté deshabilitado", async () => {
    delete process.env[ENABLED_KEY];

    await expect(sendMaintenanceRequestCreatedEvent(makeRequest())).resolves.toBeUndefined();
  });
});
