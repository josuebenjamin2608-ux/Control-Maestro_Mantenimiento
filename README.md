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
| `DATABASE_URL` | Cadena de conexión a PostgreSQL usada por Prisma y por la app. |

Copia `.env.example` a `.env` y reemplaza los valores por los de tu base de
datos real. `.env` está excluido de git (ver `.gitignore`).

## 6. Cómo configurar PostgreSQL

Cualquier instancia de PostgreSQL 14+ sirve. Opciones habituales:

- **Local (desarrollo):** instalar PostgreSQL o levantar un contenedor:
  ```bash
  docker run --name control-maestro-db -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_DB=control_maestro_mantenimiento -p 5432:5432 -d postgres:16
  ```
  y usar `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/control_maestro_mantenimiento?schema=public"`.
- **Local vía Prisma:** `npx prisma dev` levanta un PostgreSQL local
  administrado por Prisma, sin Docker.
- **Gestionado (recomendado para producción/Vercel):** Neon, Supabase o
  Vercel Postgres. Todos entregan una cadena `DATABASE_URL` compatible; si el
  proveedor usa *connection pooling* (PgBouncer) para el runtime, revisa su
  documentación sobre si necesitas una URL directa adicional para ejecutar
  migraciones — no forma parte de esta fase, ya que aún no hay migraciones
  generadas.

## 7. Cómo ejecutar Prisma

El esquema vive en `prisma/schema.prisma`. La configuración de Prisma CLI
(ruta del esquema, carpeta de migraciones, URL de conexión) vive en
`prisma7.config.ts`, que lee `DATABASE_URL` desde `.env`.

```bash
# Generar el cliente de Prisma (ya se ejecuta automáticamente en postinstall)
npx prisma generate

# Crear la primera migración y aplicarla a la base de datos configurada
npx prisma migrate dev --name init

# Ver/editar los datos con una UI
npx prisma studio
```

> Esta fase entrega el esquema base (`Role`, `User`, `Technician`, `Machine`,
> `MaintenancePlan`, `MaintenanceOrder`, `SparePart`, `InventoryMovement`,
> `MaintenanceHistory`) pero **todavía no se generó ninguna migración**: se
> generará junto con el primer módulo funcional, para evitar migraciones
> vacías o que deban revertirse por cambios de diseño.

## 8. Cómo desplegar en Vercel

1. Importar el repositorio en [Vercel](https://vercel.com/new); Vercel
   detecta automáticamente que es un proyecto Next.js (no requiere
   `vercel.json`).
2. En **Project Settings → Environment Variables**, definir `DATABASE_URL`
   con la cadena de conexión de tu PostgreSQL de producción (Neon, Supabase,
   Vercel Postgres, etc.).
3. Desplegar. El script `postinstall` (`prisma generate`) se ejecuta
   automáticamente durante el build de Vercel, por lo que no hace falta
   configuración adicional para Prisma.
4. Antes de desplegar el primer módulo funcional, aplicar las migraciones
   contra la base de datos de producción con `npx prisma migrate deploy`
   (desde CI/CD o localmente apuntando a `DATABASE_URL` de producción).

## Próxima fase

Con la base ya configurada, el trabajo siguiente es habilitar los módulos
uno a uno (empezando por Máquinas y Usuarios/Roles), cada uno con su
migración de Prisma, sus Server Actions, su servicio y su UI — siguiendo la
estructura descrita en la sección 3.
