// Stable re-export surface for domain types. App code should import model
// and enum types from here instead of reaching into `@/generated/prisma`
// directly, so the generator output path can change without touching callers.
export type {
  Role,
  User,
  Technician,
  Machine,
  MachineStatus,
  MachineCriticality,
  MaintenancePlan,
  PlanFrequencyType,
  MaintenanceOrder,
  MaintenanceType,
  MaintenancePriority,
  MaintenanceOrderStatus,
  SparePart,
  InventoryMovement,
  InventoryMovementType,
  MaintenanceHistory,
} from "@/generated/prisma/client";
