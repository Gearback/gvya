export class GvyaRuntime {
    #backend;
    constructor(backend) { this.#backend = backend; }
    static async open(artifact, backend, options) {
        await backend.open(artifact, options);
        return new GvyaRuntime(backend);
    }
    info() { return this.#backend.info(); }
    capabilities() { return this.#backend.capabilities(); }
    capabilityInfo(id) { return this.#backend.capabilityInfo(id); }
    turn(request) { return this.#backend.turn(request); }
    confirmTurn(request, proposal, confirmed, confirmationId) {
        const grant = { id: confirmationId, proposal_id: proposal.id, fingerprint: proposal.fingerprint, confirmed };
        return this.#backend.turn({ ...request, confirmations: [...(request.confirmations ?? []), grant] });
    }
    openConversation(request) { return this.#backend.openConversation(request); }
    capabilityResult(request) { return this.#backend.capabilityResult(request); }
    assetByPath(path) { return this.#backend.assetByPath(path); }
    assetById(id) { return this.#backend.assetById(id); }
    assetInfoById(id) { return this.#backend.assetInfoById(id); }
    close() { return this.#backend.close(); }
}
