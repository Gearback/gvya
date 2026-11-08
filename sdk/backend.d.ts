import type { GvyaAssetInfo, GvyaCapabilitiesInfo, GvyaCapabilityInfo, GvyaCapabilityResultRequest, GvyaCapabilityResultResult, GvyaOpenRequest, GvyaRuntimeOpenOptions, GvyaRuntimeInfo, GvyaTurnRequest, GvyaTurnResult } from "./contracts.js";
export interface RuntimeBackend {
    open(artifact: Uint8Array, options: GvyaRuntimeOpenOptions): Promise<void>;
    info(): Promise<GvyaRuntimeInfo>;
    capabilities(): Promise<GvyaCapabilitiesInfo>;
    capabilityInfo(id: string): Promise<GvyaCapabilityInfo>;
    turn(request: GvyaTurnRequest): Promise<GvyaTurnResult>;
    openConversation(request: GvyaOpenRequest): Promise<GvyaTurnResult>;
    capabilityResult(request: GvyaCapabilityResultRequest): Promise<GvyaCapabilityResultResult>;
    assetByPath(path: string): Promise<Uint8Array>;
    assetById(id: string): Promise<Uint8Array>;
    assetInfoById(id: string): Promise<GvyaAssetInfo>;
    close(): Promise<void>;
}
