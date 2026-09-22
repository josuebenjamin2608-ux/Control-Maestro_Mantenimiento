/**
 * Mini-motor de consultas en memoria que imita el subconjunto de la API de
 * Prisma que indicators.service.ts y maintenance-requests.service.ts
 * realmente usan (findMany con where/distinct/orderBy/take/skip, count,
 * groupBy). No es un mock de "fue llamado": evalúa el mismo WHERE que
 * recibiría Postgres contra filas en memoria, para poder afirmar sobre el
 * RESULTADO real de la lógica de negocio (buckets, universos, filtros) sin
 * levantar una base de datos real. Vive fuera de los archivos *.test.ts para
 * que vitest no lo trate como una suite de pruebas.
 */

export type FakeRow = Record<string, unknown>;

interface FieldCondition {
  in?: unknown[];
  not?: unknown;
  gte?: unknown;
  lte?: unknown;
  gt?: unknown;
  lt?: unknown;
}

type WhereInput = Record<string, unknown> | undefined;

function toComparable(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" || typeof value === "string") return value;
  return String(value);
}

function fieldConditionMatches(value: unknown, condition: unknown): boolean {
  if (condition === null) return value === null;
  if (condition instanceof Date) {
    return value instanceof Date && value.getTime() === condition.getTime();
  }
  if (typeof condition !== "object") {
    return value === condition;
  }

  const cond = condition as FieldCondition;

  if ("in" in cond && cond.in) {
    if (!cond.in.includes(value)) return false;
  }
  if ("not" in cond) {
    if (value === cond.not) return false;
  }

  if ("gte" in cond && !compareOp(value, cond.gte, (diff) => diff >= 0)) return false;
  if ("lte" in cond && !compareOp(value, cond.lte, (diff) => diff <= 0)) return false;
  if ("gt" in cond && !compareOp(value, cond.gt, (diff) => diff > 0)) return false;
  if ("lt" in cond && !compareOp(value, cond.lt, (diff) => diff < 0)) return false;

  return true;
}

/**
 * NULL nunca satisface una comparación gte/lte/gt/lt (misma semántica de
 * tres valores que SQL: comparar NULL con algo es "desconocido", tratado
 * como falso). Los únicos campos comparados así en este código (FECHA,
 * COMMITMENTDATE) son siempre Date | null, así que basta comparar por
 * epoch-ms.
 */
function compareOp(value: unknown, bound: unknown, test: (diff: number) => boolean): boolean {
  const a = toComparable(value);
  const b = toComparable(bound);
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  return test(a < b ? -1 : a > b ? 1 : 0);
}

export function matchWhere(row: FakeRow, where: WhereInput): boolean {
  if (!where) return true;
  for (const [key, condition] of Object.entries(where)) {
    if (key === "AND") {
      const list = condition as WhereInput[];
      if (!list.every((c) => matchWhere(row, c))) return false;
    } else if (key === "OR") {
      const list = condition as WhereInput[];
      if (!list.some((c) => matchWhere(row, c))) return false;
    } else if (key === "NOT") {
      const list = Array.isArray(condition) ? (condition as WhereInput[]) : [condition as WhereInput];
      if (list.some((c) => matchWhere(row, c))) return false;
    } else {
      if (!fieldConditionMatches(row[key], condition)) return false;
    }
  }
  return true;
}

function compareForSort(a: unknown, b: unknown): number {
  const av = toComparable(a);
  const bv = toComparable(b);
  if (av === null && bv === null) return 0;
  if (av === null) return -1;
  if (bv === null) return 1;
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

interface FindManyArgs {
  where?: WhereInput;
  distinct?: string[];
  orderBy?: Record<string, "asc" | "desc">;
  take?: number;
  skip?: number;
}

interface CountArgs {
  where?: WhereInput;
}

interface GroupByArgs {
  by: string[];
  where?: WhereInput;
}

function findMany(rows: FakeRow[], args: FindManyArgs = {}): FakeRow[] {
  const { where, distinct, orderBy, take, skip } = args;
  let result = rows.filter((row) => matchWhere(row, where));

  if (distinct && distinct.length > 0) {
    const seen = new Set<string>();
    result = result.filter((row) => {
      const key = distinct.map((field) => String(row[field])).join("\u0000");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  if (orderBy) {
    const [field, direction] = Object.entries(orderBy)[0] as [string, "asc" | "desc"];
    result = [...result].sort((a, b) => {
      const cmp = compareForSort(a[field], b[field]);
      return direction === "desc" ? -cmp : cmp;
    });
  }

  if (skip !== undefined) result = result.slice(skip);
  if (take !== undefined) result = result.slice(0, take);

  return result.map((row) => ({ ...row }));
}

function count(rows: FakeRow[], args: CountArgs = {}): number {
  return rows.filter((row) => matchWhere(row, args.where)).length;
}

function groupBy(rows: FakeRow[], args: GroupByArgs): FakeRow[] {
  const { by, where } = args;
  const filtered = rows.filter((row) => matchWhere(row, where));
  const groups = new Map<string, { keys: FakeRow; count: number }>();

  for (const row of filtered) {
    const keys: FakeRow = {};
    for (const field of by) keys[field] = row[field];
    const key = by.map((field) => String(row[field])).join("\u0000");
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { keys, count: 1 });
  }

  return Array.from(groups.values()).map((group) => ({ ...group.keys, _count: { _all: group.count } }));
}

export interface FakeDbState {
  requests: FakeRow[];
  logs: FakeRow[];
}

/**
 * Crea el objeto `db` falso una sola vez; los tests mutan `state.requests`/
 * `state.logs` (p. ej. en beforeEach) y las próximas llamadas ya ven las
 * filas nuevas, porque los métodos leen `state` en el momento de ejecutarse,
 * no en el momento de crearse.
 */
export function createFakeDb(state: FakeDbState) {
  return {
    maintenanceRequest: {
      findMany: (args?: FindManyArgs) => Promise.resolve(findMany(state.requests, args)),
      count: (args?: CountArgs) => Promise.resolve(count(state.requests, args)),
      groupBy: (args: GroupByArgs) => Promise.resolve(groupBy(state.requests, args)),
    },
    maintenanceLog: {
      findMany: (args?: FindManyArgs) => Promise.resolve(findMany(state.logs, args)),
    },
  };
}

/** Fila mínima de MaintenanceRequest con defaults razonables — cada test sobreescribe solo lo que le importa. */
export function makeRequestRow(overrides: Partial<FakeRow> & { id: string }): FakeRow {
  return {
    parte: overrides.id,
    codigo: null,
    maquina: "MAQUINA-1",
    pieza: null,
    problema: null,
    tarea: null,
    fecha: null,
    codemple: null,
    empleado: null,
    estado: "Solicitado",
    responsibleArea: null,
    commitmentDate: null,
    isHistorical: false,
    assignedTechnicians: [],
    ...overrides,
  };
}

/** Fila mínima de MaintenanceLog — solo los campos que getLatestFechafinByRequest realmente lee. */
export function makeLogRow(overrides: Partial<FakeRow> & { id: string }): FakeRow {
  return {
    registro: overrides.id,
    relationStatus: "RELATED",
    maintenanceRequestId: null,
    fechafin: null,
    ...overrides,
  };
}

export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}
