import type { RuntimeBackend } from "./backend.js";
import type { InvocationProposal, GvyaAssetInfo, GvyaCapabilitiesInfo, GvyaCapabilityInfo, GvyaCapabilityResultRequest, GvyaCapabilityResultResult, GvyaOpenRequest, GvyaRuntimeOpenOptions, GvyaRuntimeInfo, GvyaTurnRequest, GvyaTurnResult } from "./contracts.js";
export declare class GvyaRuntime {
    #private;
    private constructor();
    static open(artifact: Uint8Array, backend: RuntimeBackend, options: GvyaRuntimeOpenOptions): Promise<GvyaRuntime>;
    info(): Promise<GvyaRuntimeInfo>;
    capabilities(): Promise<GvyaCapabilitiesInfo>;
    capabilityInfo(id: string): Promise<GvyaCapabilityInfo>;
    turn(request: GvyaTurnRequest): Promise<GvyaTurnResult>;
    confirmTurn(request: GvyaTurnRequest, proposal: InvocationProposal, confirmed: boolean, confirmationId: string): Promise<GvyaTurnResult>;
    openConversation(request: GvyaOpenRequest): Promise<GvyaTurnResult>;
    capabilityResult(request: GvyaCapabilityResultRequest): Promise<GvyaCapabilityResultResult>;
    assetByPath(path: string): Promise<Uint8Array>;
    assetById(id: string): Promise<Uint8Array>;
    assetInfoById(id: string): Promise<GvyaAssetInfo>;
    close(): Promise<void>;
}
