export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type ContributionMode =
  | "add"
  | { type: "replace"; target_package: string; target_id: string };

export interface Contribution<T> {
  id: string;
  exported: boolean;
  mode: ContributionMode;
  value: T;
}

export interface PackageDependency {
  id: string;
  reexport: boolean;
}

export type PackageKind = "standard" | "fallback";

export interface PackageManifest {
  id: string;
  kind: PackageKind;
  description: string;
  dependencies: PackageDependency[];
}

export type MeaningClass = "general" | "social" | "clarification";
export type SlotType = "string" | "number" | "boolean" | "entity" | "reference";

export interface MeaningSlot {
  name: string;
  type: SlotType;
  entity_kind: string;
  reference_kind: string;
  required: boolean;
  elicitation: LocalizedSample[];
}

export interface MeaningReference {
  kind: string;
  required: boolean;
  elicitation: LocalizedSample[];
}

export interface LocalizedSample {
  language: string;
  text: string;
}

export interface LocalizedStructuralPattern extends LocalizedSample {
  priority: number;
}

export interface MeaningDefinition {
  id: string;
  class: MeaningClass;
  patterns: LocalizedStructuralPattern[];
  samples: LocalizedSample[];
  negative_samples: LocalizedSample[];
  retrieval_terms: LocalizedSample[];
  priority: number;
  positive_assumption: boolean;
  slots: MeaningSlot[];
  references: MeaningReference[];
}

export type ConditionNamespace = "author" | "conversation" | "context" | "meaning" | "system" | "interaction";
export type PredicateOp = "exists" | "missing" | "equal" | "not_equal" | "greater" | "greater_or_equal" | "less" | "less_or_equal";

export interface ValueCondition {
  namespace: ConditionNamespace;
  path: string;
  op: PredicateOp;
  value: JsonValue;
  hasValue: boolean;
}

export type BehaviorValueNamespace = Exclude<ConditionNamespace, "interaction">;

export interface ValueRequirement {
  namespace: BehaviorValueNamespace;
  path: string;
  value: JsonValue;
}

export interface ConversationEffect {
  type: "assign" | "increment";
  target: { namespace: "author"; path: string };
  value: JsonValue;
  delta: number;
}

export interface LocalizedTexts {
  language: string;
  variants: string[];
}

export type ResponseKind = "normal" | "hint" | "repeat" | "annoyed_repeat" | "final_repeat" | "fallback" | "opening";
export type RepeatStage = "" | "repeat" | "annoyed" | "final";

export interface FollowupDirective {
  id: string;
  ttl: number;
  refresh_if_same: boolean;
}

export interface ExtraMessage {
  chance: number;
  texts: LocalizedTexts[];
}

export interface ResponseAsset {
  asset_id: string;
  alt_text: string;
}

export interface ResponseLink {
  label: string;
  url: string;
}

export interface ResponseDefinition {
  id: string;
  kind: ResponseKind;
  texts: LocalizedTexts[];
  conditions: ValueCondition[];
  hint_level: number | null;
  repeat_stage: RepeatStage;
  effects: ConversationEffect[];
  opens_followup: FollowupDirective | null;
  extra_messages: ExtraMessage[];
  assets: ResponseAsset[];
  links: ResponseLink[];
}

export interface BehaviorDefinition {
  id: string;
  meaning: string;
  topic: string;
  topic_scoped: boolean;
  activates_topic: boolean;
  topic_ttl: number | null;
  followup_scope: string;
  /** Runtime/source-only repair eligibility; intentionally not a Human Studio toggle. */
  repair_continuation_candidate: boolean;
  repeat_same_input_after: number | null;
  repeat_same_meaning_after: number | null;
  requires_values: ValueRequirement[];
  forbidden_values: ValueRequirement[];
  responses: ResponseDefinition[];
}


export type FallbackTrigger = "unresolved" | "repeat";

export interface FallbackBehaviorDefinition {
  id: string;
  trigger: FallbackTrigger;
  priority: number;
  conditions: ValueCondition[];
  responses: ResponseDefinition[];
}

export interface CapabilityResultBehavior {
  id: string;
  capability: string;
  capability_version: string;
  succeeded: boolean | null;
  error_code: string;
  responses: ResponseDefinition[];
}

export interface OpeningDefinition {
  id: string;
  topic: string;
  topic_ttl: number | null;
  responses: ResponseDefinition[];
}

export type EffectClass = "pure" | "reversible" | "irreversible" | "external";
export type ConfirmationHint = "never" | "conditional" | "always";

export interface CapabilityContract {
  id: string;
  version: string;
  title: string;
  description: string;
  input_schema: JsonObject;
  output_schema: JsonObject | null;
  reference_kinds: string[];
  effect_class: EffectClass;
  confirmation_hint: ConfirmationHint;
}

export interface HostEffect {
  resource: string;
  kind: "read" | "update" | "create" | "delete" | "external";
  summary: string;
}

export interface CapabilityDefinition {
  contract: CapabilityContract;
  host_effects: HostEffect[];
}

export type BindingSourceType = "meaning_slot" | "meaning_reference" | "focus_reference" | "context_path" | "author_state_path" | "literal";
export interface BindingSource {
  type: BindingSourceType;
  name: string;
  kind: string;
  projection: "id" | "object";
  path: string;
  value: JsonValue;
}

export interface ArgumentBinding {
  target: string;
  source: BindingSource;
}

export interface CapabilityBinding {
  id: string;
  trigger: { meaning: string; behavior: string; response: string };
  capability: string;
  arguments: ArgumentBinding[];
}

export type AdmissionNamespace = "arguments" | "context" | "author" | "conversation" | "system";
export interface AdmissionPredicate {
  namespace: AdmissionNamespace;
  path: string;
  op: PredicateOp;
  value: JsonValue;
  hasValue: boolean;
}

export type PolicyEffect =
  | { type: "allow"; reason_code: "" }
  | { type: "require_confirmation"; reason_code: string }
  | { type: "deny"; reason_code: string };

export interface CapabilityPolicy {
  id: string;
  capability: string;
  priority: number;
  conditions: AdmissionPredicate[];
  effect: PolicyEffect;
}

export interface AssetDefinition {
  id: string;
  media_type: string;
  logical_path: string;
  source: string;
}

/** Immutable package-owned source bytes kept outside the JSON authoring model. */
export interface StudioAssetFile {
  owner_key: string;
  package_id: string;
  source: string;
  media_type: string;
  blob: Blob;
}

export interface RuntimeContext {
  values: Record<string, JsonValue>;
  visible_references: Array<{ kind: string; id: string }>;
  available_capabilities: Array<{ id: string; version: string }>;
}

export interface TurnExpectation {
  meaning: string;
  forbidden_meanings: string[];
  meaning_slots: Record<string, JsonValue>;
  meaning_references: Array<{ kind: string; id: string }>;
  min_semantic_score: number | null;
  conversation_mode: string;
  response_ids: string[];
  forbidden_response_ids: string[];
  response_contains: string[];
  response_not_contains: string[];
  author_values: Record<string, JsonValue>;
  conversation_values: Record<string, JsonValue>;
  active_topic: string;
  active_followup: string;
  capabilities: Array<{ id: string; version: string; arguments: Record<string, JsonValue> | null }>;
  proposal_receipts: Array<{ id: string; version: string; arguments: Record<string, JsonValue> | null; outcome: "admitted" | "needs_confirmation" | "rejected"; reason_code: string }>;
  forbidden_capabilities: string[];
  capability_result_accepted: boolean | null;
  capability_result_reason_code: string;
  why_codes: string[];
  forbidden_why_codes: string[];
}

export interface RegressionCase {
  id: string;
  description: string;
  input: string;
  language: string;
  context: RuntimeContext;
  initial_state: JsonObject;
  seed: number | null;
  unix_time_ms: number | null;
  expectation: TurnExpectation;
  generated: boolean;
}

export interface ScenarioReferenceCandidate {
  reference: { kind: string; id: string };
  label: string;
  aliases: string[];
}

export type ScenarioHint =
  | { type: "none" | "first" | "next" | "auto" }
  | { type: "direct"; level: number };

export interface ScenarioOpenStep {
  type: "open";
  language: string;
  context: RuntimeContext | null;
  seed: number | null;
  unix_time_ms: number | null;
  expectation: TurnExpectation;
}

export interface ScenarioTurnStep {
  type: "turn";
  say: string;
  language: string;
  context: RuntimeContext | null;
  reference_candidates: ScenarioReferenceCandidate[];
  resolver_context: Record<string, JsonValue>;
  hint: ScenarioHint;
  seed: number | null;
  unix_time_ms: number | null;
  expectation: TurnExpectation;
}

export interface ScenarioCapabilityResultStep {
  type: "capability_result";
  proposal_from_step: number;
  proposal_capability: string;
  proposal_ordinal: number | null;
  succeeded: boolean;
  output: JsonValue | undefined;
  error_code: string;
  language: string;
  context: RuntimeContext | null;
  seed: number | null;
  unix_time_ms: number | null;
  expectation: TurnExpectation;
}

export interface ScenarioConfirmStep {
  type: "confirm";
  proposal_from_step: number;
  proposal_capability: string;
  proposal_ordinal: number | null;
  confirmed: boolean;
  context: RuntimeContext | null;
  unix_time_ms: number | null;
  expectation: TurnExpectation;
}

export type ScenarioStep =
  | ScenarioOpenStep
  | ScenarioTurnStep
  | ScenarioCapabilityResultStep
  | ScenarioConfirmStep;

export interface ConversationScenario {
  id: string;
  description: string;
  context: RuntimeContext;
  initial_state: JsonObject;
  steps: ScenarioStep[];
  generated: boolean;
}

export interface PackageContents {
  meanings: Contribution<MeaningDefinition>[];
  behaviors: Contribution<BehaviorDefinition>[];
  capability_result_behaviors: Contribution<CapabilityResultBehavior>[];
  openings: Contribution<OpeningDefinition>[];
  fallback_behaviors: Contribution<FallbackBehaviorDefinition>[];
  style_lexicons: Contribution<JsonObject>[];
  capabilities: Contribution<CapabilityDefinition>[];
  capability_bindings: Contribution<CapabilityBinding>[];
  capability_policies: Contribution<CapabilityPolicy>[];
  capability_configs: Contribution<JsonObject>[];
  types: Contribution<JsonObject>[];
  assets: Contribution<AssetDefinition>[];
  regression_cases: Contribution<RegressionCase>[];
  scenarios: Contribution<ConversationScenario>[];
}

/** Paired JSON-only Language and Matcher Profile data for one language catalog entry. */
export interface MatcherProfile {
  language: string;
  language_profile: JsonObject;
  profile: JsonObject;
}

export interface StudioPackage {
  path: string;
  /** Human-authoring preference only; never emitted into canonical GVYA source. */
  authoring_language: string;
  manifest: PackageManifest;
  contents: PackageContents;
}

export interface SemanticConfig {
  candidate_limit: number;
  resolution_threshold: number;
  ambiguity_margin: number;
  resolver_min_confidence: number;
  resolver_candidate_limit: number;
}

export interface AuthorNumberDefinition { path: string; default: number; min: number; max: number; }

export interface ConversationConfig {
  default_topic_ttl: number;
  default_followup_ttl: number;
  recent_response_limit: number;
  recent_variant_limit: number;
  recent_user_window: number;
  repeat_detection_window: number;
  repeat_detection_threshold: number;
  max_messages_per_turn: number;
  repair_candidate_min_score: number;
  author_numbers: AuthorNumberDefinition[];
  topic_preference_margin: number;
}

/** Studio-wide conversation defaults. Numeric author memory is owned by each Bot. */
export type StudioConversationDefaults = Omit<ConversationConfig, "author_numbers">;

/** Bot scalar overrides plus the Bot-owned numeric memory declarations. */
export type StudioBotConversationSettings = Partial<StudioConversationDefaults> & Pick<ConversationConfig, "author_numbers">;

export interface StudioBotSettings {
  emit_debug_map: boolean;
  semantic: Partial<SemanticConfig>;
  conversation: StudioBotConversationSettings;
}

export interface StudioBot {
  id: string;
  title: string;
  description: string;
  /** Explicit runtime default selected from this Bot's Project languages. */
  default_language: string;
  /** Runtime language allow-list. The default language is always enabled. */
  enabled_languages: string[];
  /** Shared or Project-owned Standard Package IDs selected by this Bot. Shared source remains in Shared scope and is snapshotted only for compilation. */
  package_ids: string[];
  /** Optional Shared or Project-owned Fallback Package. Fallback Packages are selected whole and never overridden. */
  fallback_package_id: string | null;
  /** Exactly one Standard Package owned by this Bot. It is created/deleted with the Bot, cannot be detached, and cannot be shared with another Bot. */
  package: StudioPackage;
  settings: StudioBotSettings;
}

export interface StudioProject {
  id: string;
  title: string;
  description: string;
  /** Portable Project-local paired Language/Matcher Profile data; its document languages are the Project catalog. */
  matcher_profiles: MatcherProfile[];
  /** Standard and Fallback Packages authored and owned by this Project. Shared references are never copied here. */
  packages: StudioPackage[];
  bots: StudioBot[];
}

export interface StudioGlobalSettings {
  semantic: SemanticConfig;
  conversation: StudioConversationDefaults;
}


export type StudioPackageScope = "shared" | "project" | "bot";

/** Persisted GVYA Studio authoring model. Version 1 is the only supported workspace contract. */
export interface StudioWorkspace {
  format: "gvya.studio.workspace";
  version: 1;
  /** Reusable JSON-only Language/Matcher Profile pairs; never exposed as Shared Packages. */
  shared_matcher_profiles: MatcherProfile[];
  shared_packages: StudioPackage[];
  settings: StudioGlobalSettings;
  projects: StudioProject[];
  selectedProjectId: string;
  selectedBotId: string;
  selectedPackageScope: StudioPackageScope;
  selectedPackageId: string;
  updatedSerial: number;
}

/** Internal materialized view for one Brain. This is not persisted as the Studio workspace. */
export interface StudioBrainWorkspace {
  format: "gvya.studio.brain-view";
  version: 1;
  project_id: string;
  brain_id: string;
  /** Language/Matcher-Profile-derived Project or Shared language catalog. */
  languages: string[];
  /** Runtime language allow-list for a Bot; previews enable their complete language catalog. */
  enabled_languages: string[];
  /** Explicit Brain runtime default. Package preview views use an explicit preview default. */
  default_language: string;
  /** Human-only default for newly authored localized rows in the selected Package. */
  authoring_language: string;
  emit_debug_map: boolean;
  semantic: SemanticConfig;
  conversation: ConversationConfig;
  /** Only Matcher Profiles whose languages are active for this materialized Brain. */
  matcher_profiles: MatcherProfile[];
  packages: StudioPackage[];
  selectedPackageId: string;
  updatedSerial: number;
}

export type StudioRoute = "projects" | "packages" | "settings" | "project" | "project-packages" | "bot" | "bot-packages" | "package-overview" | "teach" | "author" | "capabilities" | "source" | "assets" | "package-simulate" | "audit" | "simulate" | "build" | "bot-settings";

export interface AuditIssue {
  id: string;
  severity: "error" | "warning" | "info";
  code: string;
  title: string;
  detail: string;
  packageId: string;
  objectType: "project" | "package" | "meaning" | "behavior" | "response" | "capability" | "binding" | "policy" | "test";
  objectId: string;
}

export interface CoverageSummary {
  meanings: number;
  behaviors: number;
  responses: number;
  capabilities: number;
  regressionCases: number;
  scenarios: number;
  meaningsWithRegression: number;
  exactSampleCollisions: number;
}
