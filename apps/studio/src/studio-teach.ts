import { auditWorkspace } from "./audit.js";
import type { ResponseDefinition, StudioBrainWorkspace } from "./types.js";
import { cloneBrainWorkspace, contribution, createBehavior, createMeaning, selectedPackage, touch, uniqueId } from "./workspace.js";

/** Human Teach actions only edit ordinary canonical Package source; matching remains the Rust Engine's decision. */
export type TeachAction = "variation" | "replace" | "new";
export interface TeachRequest {
  action: TeachAction;
  input: string;
  answer: string;
  language: string;
  behaviorId?: string;
  responseId?: string;
  previousReply?: string;
  topic?: string;
  topicScoped?: boolean;
}

function languageMatches(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

export function teachResponseTarget(
  workspace: StudioBrainWorkspace,
  behaviorId: string | null,
  reply: string,
  language: string,
): { behaviorId: string; responseId: string; canReplace: boolean } | null {
  if (!behaviorId) return null;
  const row = selectedPackage(workspace).contents.behaviors.find((item) => item.value.id === behaviorId);
  if (!row) return null; // A dependency or fallback owns this result, not the open Package.
  const responses = row.value.responses.filter((response) => response.kind === "normal");
  const matched = responses.find((response) => response.texts.some(
    (block) => languageMatches(block.language, language) && block.variants.some((text) => text.trim() === reply.trim()),
  ));
  if (matched) return { behaviorId, responseId: matched.id, canReplace: true };
  if (responses.length === 1) return { behaviorId, responseId: responses[0]!.id, canReplace: false };
  return null; // Do not guess which conditional response the Engine selected.
}

function requireResponse(workspace: StudioBrainWorkspace, request: TeachRequest): ResponseDefinition {
  const behavior = selectedPackage(workspace).contents.behaviors.find((row) => row.value.id === request.behaviorId)?.value;
  if (!behavior) throw new Error("That Behavior is not owned by this Package. Add a new answer or open the owning Package.");
  const response = behavior.responses.find((row) => row.id === request.responseId);
  if (!response) throw new Error("The selected Response is no longer available.");
  if (response.kind !== "normal") throw new Error("This response uses a special runtime stage. Edit it in Behaviors.");
  return response;
}

export function teachConversation(workspace: StudioBrainWorkspace, request: TeachRequest): StudioBrainWorkspace {
  const input = request.input.trim();
  const answer = request.answer.trim();
  const language = request.language.trim();
  if (!input || !answer) throw new Error("Both the NPC message and your answer are required.");
  if (!workspace.languages.some((row) => languageMatches(row, language))) throw new Error("Choose a language available in this Package.");
  const draft = cloneBrainWorkspace(workspace);
  const pkg = selectedPackage(draft);
  if (pkg.manifest.kind !== "standard") throw new Error("Teach supports Standard Packages. Use Fallback Behaviors for fallback authoring.");
  const authoredIds: string[] = [];

  if (request.action === "variation" || request.action === "replace") {
    const response = requireResponse(draft, request);
    const textRow = response.texts.find((row) => languageMatches(row.language, language));
    if (request.action === "replace") {
      if (!textRow) throw new Error("The original reply has no text in the selected language.");
      const original = request.previousReply?.trim() ?? "";
      const index = textRow.variants.findIndex((text) => text.trim() === original);
      if (index < 0) throw new Error("The visible reply no longer matches this Response. Open Behaviors to choose the exact variant.");
      if (textRow.variants.some((text, i) => i !== index && text.trim() === answer)) throw new Error("This answer already exists as a variant.");
      textRow.variants[index] = answer;
    } else {
      if (textRow?.variants.some((text) => text.trim() === answer)) throw new Error("This answer is already a variant.");
      if (textRow) textRow.variants.push(answer);
      else response.texts.push({ language, variants: [answer] });
    }
    authoredIds.push(request.behaviorId!, request.responseId!);
  } else if (request.action === "new") {
    const normalized = input.normalize("NFKC").toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ".").replace(/^\.+|\.+$/gu, "").slice(0, 60);
    const stem = normalized || "line";
    const existingMeanings = draft.packages.flatMap((row) => row.contents.meanings.map((item) => item.value.id));
    const existingBehaviors = draft.packages.flatMap((row) => row.contents.behaviors.map((item) => item.value.id));
    const meaningId = uniqueId(existingMeanings, `teach.${stem}`);
    const behaviorId = uniqueId(existingBehaviors, `${meaningId}.behavior`);
    const meaning = createMeaning(meaningId, language);
    meaning.samples = [{ language, text: input }];
    const behavior = createBehavior(behaviorId, meaningId, language);
    behavior.responses[0]!.texts = [{ language, variants: [answer] }];
    const topic = (request.topic ?? "").trim();
    if (topic.length > 256 || /[\u0000-\u001f\u007f]/u.test(topic)) throw new Error("Topic must be at most 256 characters without control characters.");
    if (request.topicScoped && !topic) throw new Error("A topic is required for topic-scoped replies.");
    behavior.topic = topic;
    behavior.topic_scoped = Boolean(request.topicScoped);
    behavior.activates_topic = Boolean(topic) && !request.topicScoped;
    pkg.contents.meanings.push(contribution(meaningId, meaning));
    pkg.contents.behaviors.push(contribution(behaviorId, behavior));
    authoredIds.push(meaningId, behaviorId, behavior.responses[0]!.id);
  } else {
    throw new Error("Unsupported teaching action.");
  }

  const introducedErrors = auditWorkspace(draft).filter((issue) =>
    issue.severity === "error" && issue.packageId === pkg.manifest.id && authoredIds.includes(issue.objectId)
  );
  if (introducedErrors.length) throw new Error(introducedErrors.map((issue) => issue.message).join("\n"));
  return touch(draft);
}
