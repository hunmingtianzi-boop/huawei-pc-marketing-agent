import type { CreateRunRequest, RunActionRequest, RunResult, ExportResponse } from "../../contracts/business";
import { BusinessError } from "./business-error";
function unavailable(): never { throw new BusinessError("MODULE_NOT_INTEGRATED", "业务模块正在集成。", 503, true); }
export async function createRun(_request: CreateRunRequest): Promise<RunResult> { return unavailable(); }
export async function getRun(_runId: string): Promise<RunResult> { return unavailable(); }
export async function listRuns(): Promise<RunResult[]> { return []; }
export async function actOnRun(_runId: string, _action: RunActionRequest): Promise<RunResult> { return unavailable(); }
export async function exportRun(_runId: string, _version: number, _format: "markdown" | "text"): Promise<ExportResponse> { return unavailable(); }
