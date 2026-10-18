import type { RuntimeModules } from "../../contracts/business";
import { clarifyTask, planContent, generateDraft } from "../workflow";
import { retrieveLocalEvidence } from "../ima/local";
import { retrieveEvidence } from "../ima/business";
import { validateDraft } from "../verification";
import { createLiveModelClient, createSyntheticModelClient } from "../llm";
export function runtimeModules(): RuntimeModules {
  return { clarifyTask, planContent, retrieveEvidence: (request, services) => request.mode === "local" ? retrieveLocalEvidence(request, services) : retrieveEvidence(request, services), generateDraft, validateDraft, createLiveModelClient, createSyntheticModelClient };
}
