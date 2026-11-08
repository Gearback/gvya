import type { RuntimeBackend } from "./backend.js";
import type { GvyaAssetInfo, GvyaCapabilitiesInfo, GvyaCapabilityInfo, GvyaCapabilityResultRequest, GvyaCapabilityResultResult, GvyaOpenRequest, GvyaRuntimeInfo, GvyaRuntimeOpenOptions, GvyaTurnRequest, GvyaTurnResult } from "./contracts.js";
export declare class WasmRuntimeBackend implements RuntimeBackend {
    #private;
    private constructor();
    static instantiate(wasm: BufferSource | WebAssembly.Module): Promise<WasmRuntimeBackend>;
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
