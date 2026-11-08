export interface GvyaArtifactLimits {
    readonly max_entries?: number;
    readonly max_path_bytes?: number;
    readonly max_entry_bytes?: number;
    readonly max_total_bytes?: number;
    readonly max_manifest_bytes?: number;
    readonly max_integrity_bytes?: number;
    readonly max_signature_bytes?: number;
    readonly max_debug_map_bytes?: number;
}
export interface GvyaProgramLimits {
    readonly max_program_bytes?: number;
    readonly max_depth?: number;
    readonly max_nodes?: number;
    readonly max_collection_entries?: number;
    readonly max_string_bytes?: number;
    readonly max_packages?: number;
}
export interface GvyaPreverifiedSignature {
    readonly content_root: string;
    readonly algorithm: string;
    readonly key_id: string;
    readonly signature: string;
}
export interface GvyaRuntimeOpenOptions {
    readonly format: "gvya.runtime.open-options";
    readonly version: 1;
    readonly artifact_limits?: GvyaArtifactLimits;
    readonly program_limits?: GvyaProgramLimits;
    readonly signature?: {
        readonly mode?: "allow_unsigned" | "require_present" | "require_verified";
        readonly preverified?: GvyaPreverifiedSignature | null;
    };
}
/** Explicitly permits unsigned artifacts. Intended for local authoring and development only. */
export declare function unsignedDevelopmentOpenOptions(): GvyaRuntimeOpenOptions;
/** Rejects unsigned artifacts while leaving signature verification to the host trust boundary. */
export declare function requireSignedArtifactOptions(): GvyaRuntimeOpenOptions;
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    readonly [key: string]: JsonValue;
};
export interface HostReference {
    readonly kind: string;
    readonly id: string;
}
export interface AvailableCapability {
    readonly id: string;
    readonly version: string;
}
export interface ContextSnapshot {
    readonly values?: Readonly<Record<string, JsonValue>>;
    readonly visible_references?: readonly HostReference[];
    readonly available_capabilities?: readonly AvailableCapability[];
}
export interface ConfirmationGrant {
    readonly id: string;
    readonly proposal_id: string;
    readonly fingerprint: string;
    readonly confirmed: boolean;
}
export interface ReferenceCandidate {
    readonly reference: HostReference;
    readonly label?: string | null;
    readonly aliases?: readonly string[];
}
export type Hint = {
    readonly type: "none" | "first" | "next" | "auto";
    readonly level?: never;
} | {
    readonly type: "direct";
    readonly level: number;
};
export interface GvyaTurnRequest {
    readonly format: "gvya.runtime.turn";
    readonly version: 1;
    readonly utterance: {
        readonly text: string;
    };
    readonly context?: ContextSnapshot;
    readonly state?: JsonValue;
    readonly reference_candidates?: readonly ReferenceCandidate[];
    readonly resolver_context?: Readonly<Record<string, JsonValue>>;
    readonly system?: Readonly<Record<string, JsonValue>>;
    readonly hint?: Hint;
    readonly seed: number | null;
    readonly confirmations?: readonly ConfirmationGrant[];
}
export interface GvyaOpenRequest {
    readonly format: "gvya.runtime.open";
    readonly version: 1;
    readonly context?: ContextSnapshot;
    readonly state?: JsonValue;
    readonly system?: Readonly<Record<string, JsonValue>>;
    readonly seed: number | null;
    readonly confirmations?: readonly ConfirmationGrant[];
}
export interface InvocationProposal {
    readonly id: string;
    readonly capability: string;
    readonly capability_version: string;
    readonly arguments: Readonly<Record<string, JsonValue>>;
    readonly fingerprint: string;
    readonly trace_id: string;
}
export interface GvyaCapabilityResultRequest {
    readonly format: "gvya.runtime.capability-result";
    readonly version: 1;
    readonly proposal: InvocationProposal;
    readonly result: {
        readonly proposal_id: string;
        readonly succeeded: boolean;
        readonly output?: JsonValue;
        readonly error_code?: string | null;
    };
    readonly context?: ContextSnapshot;
    readonly state?: JsonValue;
    readonly system?: Readonly<Record<string, JsonValue>>;
    readonly seed: number | null;
    readonly confirmations?: readonly ConfirmationGrant[];
}
export interface GvyaCapabilityResultResult {
    readonly format: "gvya.runtime.capability-result-result";
    readonly version: 1;
    readonly validation: {
        readonly accepted: boolean;
        readonly reason_code: string | null;
        readonly trace: JsonValue;
    };
    readonly interaction: GvyaTurnResult | null;
    readonly why: JsonValue;
}
export interface GvyaTurnResult {
    readonly format: "gvya.runtime.turn-result";
    readonly version: 1;
    readonly mode: string;
    readonly meaning: JsonValue;
    readonly behavior: string | null;
    readonly response: JsonValue;
    readonly state: JsonValue;
    readonly capabilities: JsonValue;
    readonly why: JsonValue;
    readonly semantic: JsonValue;
    readonly traces: readonly JsonValue[];
}
export interface GvyaRuntimeInfo {
    readonly format: "gvya.runtime.info";
    readonly version: 1;
    readonly project_id: string;
    readonly brain_id: string;
    readonly enabled_languages: readonly string[];
    readonly default_language: string;
    readonly artifact_sha256: string;
    readonly content_root: string;
    readonly trust: JsonValue;
}
export interface GvyaCapabilityContractInfo {
    readonly id: string;
    readonly version: string;
    readonly title: string;
    readonly description: string;
    readonly input_schema: JsonValue;
    readonly output_schema: JsonValue | null;
    readonly reference_kinds: readonly string[];
    readonly effect_class: "pure" | "reversible" | "irreversible" | "external";
    readonly confirmation_hint: "never" | "conditional" | "always";
    readonly host_effects: readonly {
        readonly resource: string;
        readonly kind: "read" | "update" | "create" | "delete" | "external";
        readonly summary: string;
    }[];
}
export interface GvyaCapabilitySummaryInfo {
    readonly id: string;
    readonly version: string;
    readonly title: string;
    readonly effect_class: "pure" | "reversible" | "irreversible" | "external";
    readonly confirmation_hint: "never" | "conditional" | "always";
}
export interface GvyaCapabilitiesInfo {
    readonly format: "gvya.runtime.capabilities";
    readonly version: 1;
    readonly capabilities: readonly GvyaCapabilitySummaryInfo[];
}
export interface GvyaCapabilityInfo {
    readonly format: "gvya.runtime.capability-info";
    readonly version: 1;
    readonly capability: GvyaCapabilityContractInfo;
}
export interface GvyaAssetInfo {
    readonly format: "gvya.runtime.asset-info";
    readonly version: 1;
    readonly id: string;
    readonly media_type: string;
    readonly logical_path: string;
    readonly sha256: string;
    readonly size: number;
}
