/** Explicitly permits unsigned artifacts. Intended for local authoring and development only. */
export function unsignedDevelopmentOpenOptions() {
    return { format: "gvya.runtime.open-options", version: 1, signature: { mode: "allow_unsigned" } };
}
/** Rejects unsigned artifacts while leaving signature verification to the host trust boundary. */
export function requireSignedArtifactOptions() {
    return { format: "gvya.runtime.open-options", version: 1, signature: { mode: "require_present" } };
}
