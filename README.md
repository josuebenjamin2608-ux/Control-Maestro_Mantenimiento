# Control Maestro Mantenimiento

Sistema interno de gestión de mantenimiento industrial (CMMS — *Computerized
Maintenance Management System*), pensado para desplegarse en Vercel.

> **Estado del proyecto:** fase de inicialización. La arquitectura, las
> herramientas y el esquema base de datos están configurados; los módulos
> operativos (máquinas, órdenes de trabajo, inventario, etc.) se
> implementarán progresivamente en las siguientes fases.

## 1. Objetivo del proyecto

Proveer una aplicación web profesional para la gestión integral del
mantenimiento industrial de una planta, cubriendo a mediano plazo:

- Máquinas y activos.
- Órdenes de trabajo (correctivas, averías, reformas).
- Mantenimiento preventivo (planes y programación).
- Técnicos y asignación de trabajo.
- Inventario y repuestos.
- Historial de mantenimiento.
- Indicadores de mantenimiento (KPIs).
- Dashboard operativo.
- Usuarios y permisos.
- Reportes y documentación técnica.

El sistema es de uso interno (no es un producto público ni una landing
comercial): la interfaz prioriza densidad de información, jerarquía visual y
eficiencia operativa por encima de la estética tipo "SaaS genérico".

## 2. Stack tecnológico

| Categoría          | Tecnología                                   |
| ------------------ | --------------------------------------------- |
| Framework          | Next.js 16 (App Router, Turbopack)            |
| Lenguaje           | TypeScript                                    |
| Estilos            | Tailwind CSS v4                               |
| Componentes UI     | shadcn/ui (Radix UI primitives + CVA)         |
| Base de datos      | PostgreSQL                                    |
| ORM                | Prisma 7 (driver adapter `@prisma/adapter-pg`)|
| Validación         | Zod                                           |
| Formularios        | React Hook Form (+ `@hookform/resolvers`)     |
| Iconografía        | Lucide Icons                                  |
| Hosting objetivo   | Vercel                                        |

Todas las dependencias se instalaron en sus versiones estables más recientes
al momento de la inicialización (Next.js 16, React 19, Tailwind 4, Prisma 7).

### Decisiones de arquitectura relevantes

- **Prisma 7 usa driver adapters.** Desde Prisma 7, `schema.prisma` ya no
  admite una `url` de conexión: la URL de Migrate se configura en
  `prisma7.config.ts` (nombre de archivo definido por la propia CLI de
  Prisma 7) y `PrismaClient`, en tiempo de ejecución, recibe la conexión a
  través de un *driver adapter*. Se eligió `@prisma/adapter-pg` (basado en
  `pg`, el driver estándar de Node para PostgreSQL) por ser agnóstico del
  proveedor — funciona igual con Neon, Supabase, Vercel Postgres o cualquier
  PostgreSQL gestionado — evitando atarse a un proveedor concreto en esta
  fase. Ver `src/lib/db.ts`.
- **El cliente de Prisma se genera fuera de `node_modules`**, en
  `src/generated/prisma` (carpeta ignorada por git). Se regenera
  automáticamente en cada `npm install` mediante el script `postinstall`, lo
  cual es imprescindible para que el build en Vercel funcione.
- **`shadcn/ui` se configuró manualmente** (`components.json` +
  `src/lib/utils.ts` + componentes en `src/components/ui`) en lugar de usar
  el CLI `npx shadcn init`, porque la política de red de este entorno de
  desarrollo bloquea el host `ui.shadcn.com`. El resultado es equivalente al
  que genera el CLI oficial y es compatible con `npx shadcn add <componente>`
  en cualquier entorno que sí tenga acceso a ese host.
- **`Role` es una tabla, no un enum**, para poder añadir o renombrar roles sin
  una migración. Los permisos finos por acción quedan fuera de esta fase.
- **`Technician` y `User` están desacoplados** (relación 1:1 opcional): no
  todo técnico necesita acceso al sistema, y no todo usuario del sistema es
  un técnico de planta.
- **`MaintenanceOrder.type` cubre preventivo, correctivo, avería y
  reforma** con un único enum (`PREVENTIVE`, `CORRECTIVE`, `BREAKDOWN`,
  `MODIFICATION`) en lugar de tablas separadas, porque las cuatro comparten
  exactamente el mismo flujo operativo (asignación, ejecución, consumo de
  repuestos, historial) y solo difieren en intención/reporte.
- **`MaintenanceHistory` es un registro inmutable**, separado de
  `MaintenanceOrder` (que sí es mutable), pensado como la fuente de datos
  para indicadores (MTTR, costos, ratio preventivo/correctivo) sin mezclar
  campos de reporte dentro del modelo operativo.
- **`SparePart.currentStock` es un valor derivado** que se mantendrá
  sincronizado a partir del histórico de `InventoryMovement` (el libro mayor
  de inventario), evitando recalcular sumas en cada lectura.

Ver los comentarios en `prisma/schema.prisma` para el detalle de cada
relación y su justificación.

## 3. Estructura del proyecto

```
src/
  app/                  # Rutas de Next.js (App Router)
  components/
    ui/                 # Componentes base de shadcn/ui (Button, Card, ...)
    layout/             # Shell de la aplicación (Sidebar, Header, AppShell)
  lib/
    db.ts               # Cliente de Prisma (singleton + driver adapter)
    utils.ts            # Utilidad `cn` para clases de Tailwind
    navigation.ts        # Definición de los módulos del menú lateral
    validations/         # Esquemas Zod por dominio (se irán agregando)
  server/
    actions/             # Server Actions por dominio (Next.js)
    services/            # Lógica de negocio y acceso a datos vía Prisma
  types/
    domain.ts            # Re-exportación de los tipos generados por Prisma

prisma/
  schema.prisma          # Esquema de base de datos
```

La UI (`components/`) no contiene lógica de negocio ni acceso a datos: eso
vive en `server/services`. Las Server Actions (`server/actions`) son una
capa delgada que valida la entrada (con los esquemas de `lib/validations`) y
delega en un servicio.

## 4. Cómo ejecutar el proyecto

Requisitos: Node.js 20.9 o superior y una base de datos PostgreSQL.

```bash
# Instalar dependencias (también genera el cliente de Prisma vía postinstall)
npm install

# Copiar las variables de entorno y completar la conexión a PostgreSQL
cp .env.example .env

# Levantar el servidor de desarrollo
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

Otros scripts disponibles:

```bash
npm run build            # Build de producción
npm run start             # Servir el build de producción
npm run lint               # ESLint
npm run prisma:generate    # Regenerar el cliente de Prisma manualmente
npm run prisma:migrate     # Crear/aplicar una migración en desarrollo
npm run prisma:studio      # Explorador visual de la base de datos
```

## 5. Variables de entorno

Definidas en `.env.example`:

| Variable       | Descripción                                              |
| -------------- | --------------------------------------------------------- |
| `DATABASE_URL` | Conexión **pooled** (a través de un connection pooler, ej. PgBouncer). La usa el cliente de Prisma en runtime (`src/lib/db.ts`) — es la que debe usar la aplicación desplegada. |
| `DIRECT_URL`   | Conexión **directa** (sin pooler) a la misma base. La usa Prisma CLI (`prisma7.config.ts`) para `migrate deploy`, `migrate dev` y `studio`: el motor de migraciones puede fallar sobre una conexión pooled. |

Copia `.env.example` a `.env` y reemplaza los valores por los de tu base de
datos real. `.env` está excluido de git (ver `.gitignore`). En desarrollo
local con una sola base sin distinción pooled/directa, `DIRECT_URL` puede
ser idéntica a `DATABASE_URL`.

## 6. Cómo configurar PostgreSQL

Cualquier instancia de PostgreSQL 14+ sirve. Opciones habituales:

- **Local (desarrollo):** instalar PostgreSQL o levantar un contenedor:
  ```bash
  docker run --name control-maestro-db -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=control_maestro_mantenimiento -p 5432:5432 -d postgres:16
  ```
  y usar la misma cadena para `DATABASE_URL` y `DIRECT_URL` (no hay pooler
  de por medio en este caso).
- **Local vía Prisma:** `npx prisma dev` levanta un PostgreSQL local
  administrado por Prisma, sin Docker (misma cadena para ambas variables).
- **Gestionado (recomendado para producción/Vercel):** Neon, Supabase o
  Vercel Postgres. Estos proveedores entregan **dos** cadenas de conexión:
  una pooled (para `DATABASE_URL`) y una directa/non-pooling (para
  `DIRECT_URL`) — usar la directa para `DATABASE_URL` también funcionaría,
  pero usar la pooled para el runtime es importante en un entorno
  serverless como Vercel (muchas invocaciones concurrentes de corta
  duración). Revisa la documentación de tu proveedor para identificar cuál
  cadena es cuál.

## 7. Cómo ejecutar Prisma

El esquema vive en `prisma/schema.prisma`. La configuración de Prisma CLI
(ruta del esquema, carpeta de migraciones, URL de conexión) vive en
`prisma7.config.ts`, que usa `DIRECT_URL` (con fallback a `DATABASE_URL` si
`DIRECT_URL` no está definida) desde `.env`.

```bash
# Generar el cliente de Prisma (ya se ejecuta automáticamente en postinstall)
npx prisma generate

# Aplicar las migraciones existentes a la base de datos configurada
npx prisma migrate deploy

# Crear una nueva migración durante desarrollo (contra DIRECT_URL)
npx prisma migrate dev --name <nombre>

# Ver/editar los datos con una UI
npx prisma studio
```

> La migración inicial (`prisma/migrations/`) ya cubre el esquema completo
> de Fase 1 y Fase 2. Las próximas migraciones se generan igual, con
> `migrate dev` en desarrollo y `migrate deploy` en producción/Preview.

## 8. Cómo desplegar en Vercel

1. Importar el repositorio en [Vercel](https://vercel.com/new); Vercel
   detecta automáticamente que es un proyecto Next.js (no requiere
   `vercel.json`).
2. En **Project Settings → Environment Variables**, definir `DATABASE_URL`
   (conexión pooled) y `DIRECT_URL` (conexión directa/non-pooling) con las
   cadenas de tu proveedor de PostgreSQL (Neon, Supabase, Vercel Postgres,
   etc.), en los entornos que correspondan (Preview/Production).
3. Desplegar. El script `postinstall` (`prisma generate`) se ejecuta
   automáticamente durante el build de Vercel, por lo que no hace falta
   configuración adicional para generar el cliente de Prisma.
4. Aplicar las migraciones contra cada base de datos con
   `npx prisma migrate deploy` (usando el `DIRECT_URL` del entorno
   correspondiente) — esto no ocurre automáticamente durante el build salvo
   que se configure explícitamente.

## Próxima fase

Con la base ya configurada, el trabajo siguiente es habilitar los módulos
uno a uno (empezando por Máquinas y Usuarios/Roles), cada uno con su
migración de Prisma, sus Server Actions, su servicio y su UI — siguiendo la
estructura descrita en la sección 3.
