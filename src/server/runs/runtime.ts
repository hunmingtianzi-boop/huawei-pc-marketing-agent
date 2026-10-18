import type { RuntimeModules } from "../../contracts/business";
import { clarifyTask, planContent, generateDraft } from "../workflow";
import { retrieveEvidence } from "../ima/business";
import { validateDraft } from "../verification";
import { createLiveModelClient, createSyntheticModelClient } from "../llm";
export function runtimeModules(): RuntimeModules {
  return { clarifyTask, planContent, retrieveEvidence, generateDraft, validateDraft, createLiveModelClient, createSyntheticModelClient };
}
