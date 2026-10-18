import type { RuntimeModules } from "../../contracts/business";
import { BusinessError } from "./business-error";
// Main integrates worker entrypoints here after reviewing their commits.
export function runtimeModules(): RuntimeModules {
  throw new BusinessError("MODULE_NOT_INTEGRATED", "业务模块尚在开发。", 503, true);
}
