export { prisma } from "./client";
export {
  forAgency,
  unsafeGlobalClient,
  TenantIsolationError,
  TENANT_MODELS,
  GLOBAL_MODELS,
  Prisma,
} from "./tenant";
export type { TenantClient, TenantModel } from "./tenant";

// Re-export every generated model type and enum so consumers import from one place:
//   import { type Website, ScanStatus, forAgency } from "@pdm/database";
export * from "@prisma/client";
