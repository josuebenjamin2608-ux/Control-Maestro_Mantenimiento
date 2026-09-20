import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ejercita el código real de technician-telegram-link.service.ts contra un
 * fake mínimo en memoria de @/lib/db (nunca toca Postgres). Cubre las
 * reglas de negocio explícitas de la vinculación: un solo código pendiente
 * por técnico, expiración, un solo uso, y que un chat_id nunca pueda quedar
 * vinculado a dos técnicos a la vez.
 */

interface FakeTechnician {
  id: string;
  fullName: string;
  telegramChatId: string | null;
  telegramLinkedAt: Date | null;
}

interface FakeLinkCode {
  id: string;
  technicianId: string;
  code: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

const { fakeState } = vi.hoisted(() => {
  return {
    fakeState: {
      technicians: new Map<string, FakeTechnician>(),
      linkCodes: new Map<string, FakeLinkCode>(),
      idCounter: 0,
    },
  };
});

function project<T extends object>(row: T, select?: Record<string, boolean>): Partial<T> | T {
  if (!select) return row;
  const projected: Record<string, unknown> = {};
  for (const key of Object.keys(select)) projected[key] = (row as Record<string, unknown>)[key];
  return projected as Partial<T>;
}

vi.mock("@/lib/db", () => {
  function findTechnicianById(id: string): FakeTechnician | null {
    return fakeState.technicians.get(id) ?? null;
  }
  function findTechnicianByChatId(chatId: string): FakeTechnician | null {
    return [...fakeState.technicians.values()].find((t) => t.telegramChatId === chatId) ?? null;
  }
  function findCodeByCode(code: string): FakeLinkCode | null {
    return [...fakeState.linkCodes.values()].find((c) => c.code === code) ?? null;
  }

  const technician = {
    findUnique: async ({
      where,
      select,
    }: {
      where: { id?: string; telegramChatId?: string };
      select?: Record<string, boolean>;
    }) => {
      const row = where.id ? findTechnicianById(where.id) : findTechnicianByChatId(where.telegramChatId!);
      return row ? project(row, select) : null;
    },
    update: async ({
      where,
      data,
      select,
    }: {
      where: { id: string };
      data: Partial<FakeTechnician>;
      select?: Record<string, boolean>;
    }) => {
      const existing = findTechnicianById(where.id);
      if (!existing) throw new Error("Technician not found (fake db)");
      const updated = { ...existing, ...data };
      fakeState.technicians.set(where.id, updated);
      return project(updated, select);
    },
  };

  const technicianTelegramLinkCode = {
    deleteMany: async ({ where }: { where: { technicianId: string; usedAt: null } }) => {
      let count = 0;
      for (const [id, row] of fakeState.linkCodes) {
        if (row.technicianId === where.technicianId && row.usedAt === where.usedAt) {
          fakeState.linkCodes.delete(id);
          count += 1;
        }
      }
      return { count };
    },
    create: async ({ data }: { data: { technicianId: string; code: string; expiresAt: Date } }) => {
      if (findCodeByCode(data.code)) {
        const error = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
        throw error;
      }
      fakeState.idCounter += 1;
      const row: FakeLinkCode = {
        id: `code_${fakeState.idCounter}`,
        usedAt: null,
        createdAt: new Date(),
        ...data,
      };
      fakeState.linkCodes.set(row.id, row);
      return row;
    },
    findUnique: async ({ where }: { where: { code: string } }) => findCodeByCode(where.code),
    update: async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<FakeLinkCode>;
    }) => {
      const existing = fakeState.linkCodes.get(where.id);
      if (!existing) throw new Error("Link code not found (fake db)");
      const updated = { ...existing, ...data };
      fakeState.linkCodes.set(where.id, updated);
      return updated;
    },
    findFirst: async ({
      where,
      select,
    }: {
      where: { technicianId: string; usedAt: null };
      orderBy?: unknown;
      select?: Record<string, boolean>;
    }) => {
      const rows = [...fakeState.linkCodes.values()]
        .filter((row) => row.technicianId === where.technicianId && row.usedAt === where.usedAt)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const row = rows[0];
      return row ? project(row, select) : null;
    },
  };

  const tx = { technician, technicianTelegramLinkCode };

  return {
    db: {
      technician,
      technicianTelegramLinkCode,
      $transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
    },
  };
});

const {
  generateTechnicianTelegramLinkCode,
  getTechnicianTelegramLinkStatus,
  consumeTechnicianTelegramLinkCode,
  unlinkTechnicianTelegram,
} = await import("./technician-telegram-link.service");

function seedTechnician(id: string, fullName: string, overrides: Partial<FakeTechnician> = {}) {
  fakeState.technicians.set(id, {
    id,
    fullName,
    telegramChatId: null,
    telegramLinkedAt: null,
    ...overrides,
  });
}

function seedCode(id: string, technicianId: string, code: string, overrides: Partial<FakeLinkCode> = {}) {
  fakeState.linkCodes.set(id, {
    id,
    technicianId,
    code,
    expiresAt: new Date(Date.now() + 10 * 60_000),
    usedAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

describe("technician-telegram-link.service", () => {
  beforeEach(() => {
    fakeState.technicians.clear();
    fakeState.linkCodes.clear();
    fakeState.idCounter = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("generateTechnicianTelegramLinkCode", () => {
    it("[1] genera un código con formato SIMI-XXXXXX que expira en ~10 minutos", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza");

      const result = await generateTechnicianTelegramLinkCode("tech_1");

      expect(result.code).toMatch(/^SIMI-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
      const diffMinutes = (result.expiresAt.getTime() - Date.now()) / 60_000;
      expect(diffMinutes).toBeGreaterThan(9.9);
      expect(diffMinutes).toBeLessThanOrEqual(10.1);
    });

    it("lanza si el técnico no existe", async () => {
      await expect(generateTechnicianTelegramLinkCode("no-existe")).rejects.toThrow("El técnico no existe.");
    });

    it("[8] al regenerar, invalida el código pendiente anterior — nunca hay dos códigos activos a la vez", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza");

      const first = await generateTechnicianTelegramLinkCode("tech_1");
      const second = await generateTechnicianTelegramLinkCode("tech_1");

      expect(second.code).not.toBe(first.code);

      const oldAttempt = await consumeTechnicianTelegramLinkCode(first.code, "555111");
      expect(oldAttempt).toEqual({ outcome: "invalid_code" });

      const newAttempt = await consumeTechnicianTelegramLinkCode(second.code, "555111");
      expect(newAttempt.outcome).toBe("linked");
    });
  });

  describe("consumeTechnicianTelegramLinkCode", () => {
    it("[2] vincula con un código válido, vigente y sin usar", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza");
      seedCode("code_1", "tech_1", "SIMI-ABC123");

      const result = await consumeTechnicianTelegramLinkCode("SIMI-ABC123", "555111");

      expect(result).toEqual({ outcome: "linked", technicianId: "tech_1", technicianName: "Benjamin Arzuza" });
    });

    it("[3] rechaza un código expirado", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza");
      seedCode("code_1", "tech_1", "SIMI-EXPIRE", { expiresAt: new Date(Date.now() - 1_000) });

      const result = await consumeTechnicianTelegramLinkCode("SIMI-EXPIRE", "555111");

      expect(result).toEqual({ outcome: "invalid_code" });
      expect(fakeState.technicians.get("tech_1")?.telegramChatId).toBeNull();
    });

    it("[4] rechaza un código ya usado", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza");
      seedCode("code_1", "tech_1", "SIMI-USED", { usedAt: new Date() });

      const result = await consumeTechnicianTelegramLinkCode("SIMI-USED", "555111");

      expect(result).toEqual({ outcome: "invalid_code" });
    });

    it("rechaza un código que nunca existió", async () => {
      const result = await consumeTechnicianTelegramLinkCode("SIMI-NOEXISTE", "555111");
      expect(result).toEqual({ outcome: "invalid_code" });
    });

    it("[5] rechaza si el chat_id ya está vinculado a OTRO técnico, sin tocar al técnico del código", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza");
      seedTechnician("tech_2", "Otro Técnico", { telegramChatId: "999", telegramLinkedAt: new Date() });
      seedCode("code_1", "tech_1", "SIMI-ABC123");

      const result = await consumeTechnicianTelegramLinkCode("SIMI-ABC123", "999");

      expect(result).toEqual({ outcome: "chat_already_linked_to_other" });
      expect(fakeState.technicians.get("tech_1")?.telegramChatId).toBeNull();
      expect(fakeState.linkCodes.get("code_1")?.usedAt).toBeNull();
    });

    it("permite re-vincular el mismo chat_id al mismo técnico que ya lo tenía (idempotente)", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza", { telegramChatId: "555111", telegramLinkedAt: new Date() });
      seedCode("code_1", "tech_1", "SIMI-ABC123");

      const result = await consumeTechnicianTelegramLinkCode("SIMI-ABC123", "555111");

      expect(result.outcome).toBe("linked");
    });

    it("[6] al vincular exitosamente, guarda telegramChatId/telegramLinkedAt y marca el código como usado", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza");
      seedCode("code_1", "tech_1", "SIMI-ABC123");

      await consumeTechnicianTelegramLinkCode("SIMI-ABC123", "555111");

      const technician = fakeState.technicians.get("tech_1");
      expect(technician?.telegramChatId).toBe("555111");
      expect(technician?.telegramLinkedAt).toBeInstanceOf(Date);

      const code = fakeState.linkCodes.get("code_1");
      expect(code?.usedAt).toBeInstanceOf(Date);
    });

    it("ignora mayúsculas/minúsculas y espacios al comparar el código recibido", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza");
      seedCode("code_1", "tech_1", "SIMI-ABC123");

      const result = await consumeTechnicianTelegramLinkCode("  simi-abc123  ", "555111");

      expect(result.outcome).toBe("linked");
    });
  });

  describe("unlinkTechnicianTelegram", () => {
    it("[7] limpia telegramChatId y telegramLinkedAt", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza", { telegramChatId: "555111", telegramLinkedAt: new Date() });

      await unlinkTechnicianTelegram("tech_1");

      const technician = fakeState.technicians.get("tech_1");
      expect(technician?.telegramChatId).toBeNull();
      expect(technician?.telegramLinkedAt).toBeNull();
    });

    it("lanza si el técnico no existe", async () => {
      await expect(unlinkTechnicianTelegram("no-existe")).rejects.toThrow("El técnico no existe.");
    });
  });

  describe("getTechnicianTelegramLinkStatus", () => {
    it("[9] técnico sin Telegram: linked=false, sin código pendiente", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza");

      const status = await getTechnicianTelegramLinkStatus("tech_1");

      expect(status).toEqual({
        linked: false,
        telegramChatId: null,
        telegramLinkedAt: null,
        pendingCode: null,
      });
    });

    it("[10] técnico con Telegram vinculado: linked=true con chatId y fecha de vinculación", async () => {
      const linkedAt = new Date("2026-09-20T12:00:00.000Z");
      seedTechnician("tech_1", "Benjamin Arzuza", { telegramChatId: "555111", telegramLinkedAt: linkedAt });

      const status = await getTechnicianTelegramLinkStatus("tech_1");

      expect(status.linked).toBe(true);
      expect(status.telegramChatId).toBe("555111");
      expect(status.telegramLinkedAt).toEqual(linkedAt);
    });

    it("devuelve el código pendiente más reciente cuando hay uno", async () => {
      seedTechnician("tech_1", "Benjamin Arzuza");
      seedCode("code_1", "tech_1", "SIMI-OLD111", { createdAt: new Date("2026-09-20T10:00:00.000Z") });
      seedCode("code_2", "tech_1", "SIMI-NEW111", { createdAt: new Date("2026-09-20T11:00:00.000Z") });

      const status = await getTechnicianTelegramLinkStatus("tech_1");

      expect(status.pendingCode?.code).toBe("SIMI-NEW111");
    });

    it("lanza si el técnico no existe", async () => {
      await expect(getTechnicianTelegramLinkStatus("no-existe")).rejects.toThrow("El técnico no existe.");
    });
  });
});
