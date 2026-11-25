import { useEffect, useRef, useState } from "react";
import type { GvyaTurnResult } from "../../../packages/runtime-sdk/dist/contracts.js";
import type { JsonValue, StudioAssetFile, StudioBrainWorkspace } from "./types.js";
import { StudioSimulationEngine, type SimulationReady } from "./simulation-engine.js";
import { parseBoundedSimulatorJson } from "./runtime-simulator.js";
import { teachConversation, teachResponseTarget, type TeachAction } from "./studio-teach.js";

interface ConversationTurn {
  input: string;
  reply: string;
  result: GvyaTurnResult;
}
interface ReviewDraft {
  index: number;
  action: TeachAction;
  newTopic: boolean;
  answer: string;
  topic: string;
  topicScoped: boolean;
  responseId: string;
  behaviorId: string;
}

function visibleReply(value: JsonValue): string {
  const queue: JsonValue[] = [value];
  for (let visited = 0; queue.length && visited < 128; visited += 1) {
    const current = queue.shift()!;
    if (Array.isArray(current)) { queue.push(...current); continue; }
    if (current && typeof current === "object") {
      if (typeof current.selected_text === "string") return current.selected_text;
      if (typeof current.text === "string") return current.text;
      queue.push(...Object.values(current));
    }
  }
  return "";
}

export function TeachView(props: {
  editingWorkspace: StudioBrainWorkspace;
  simulationWorkspace: StudioBrainWorkspace;
  assetFiles: readonly StudioAssetFile[];
  replaceWorkspace: (workspace: StudioBrainWorkspace) => boolean;
  onOpenBehaviors: () => void;
  onOpenSimulate: () => void;
}) {
  const engine = useRef(new StudioSimulationEngine());
  const serial = useRef(0);
  const [ready, setReady] = useState<SimulationReady | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [review, setReview] = useState<ReviewDraft | null>(null);
  const [approved, setApproved] = useState<number[]>([]);
  const [language, setLanguage] = useState(props.editingWorkspace.authoring_language);
  const [contextText, setContextText] = useState("{}");

  useEffect(() => {
    const current = ++serial.current;
    setBusy(true);
    setReady(null);
    setError("");
    setTurns([]); setReview(null); setApproved([]);
    engine.current.resetConversation();
    void engine.current.prepare(props.simulationWorkspace, props.assetFiles).then((result) => {
      if (current === serial.current) setReady(result);
    }).catch((cause) => {
      if (current === serial.current) setError(String(cause));
    }).finally(() => { if (current === serial.current) setBusy(false); });
  }, [props.simulationWorkspace, props.assetFiles]);
  useEffect(() => () => { ++serial.current; void engine.current.close(); }, []);
  useEffect(() => { setLanguage(props.editingWorkspace.authoring_language); }, [props.editingWorkspace.selectedPackageId, props.editingWorkspace.authoring_language]);

  const send = async () => {
    const utterance = input.trim();
    if (!utterance || busy || !ready) return;
    setBusy(true); setError(""); setNotice(""); setReview(null);
    try {
      const values = parseBoundedSimulatorJson(contextText, "Host context");
      if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Host context must be a JSON object.");
      const result = await engine.current.session.turn(utterance, {
        values: values as Record<string, JsonValue>,
        availableCapabilities: [],
        visibleReferences: [],
      }, 1);
      setTurns((rows) => [...rows, { input: utterance, reply: visibleReply(result.response) || "No visible reply", result }]);
      setInput("");
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };

  const reset = () => {
    if (busy) return;
    engine.current.resetConversation();
    setTurns([]); setReview(null); setApproved([]); setError(""); setNotice("");
  };

  const beginReview = (index: number, action: TeachAction, newTopic = false) => {
    const turn = turns[index]!;
    const target = teachResponseTarget(props.editingWorkspace, turn.result.behavior, turn.reply, language);
    if (action !== "new" && !target) return;
    if (action === "replace" && !target?.canReplace) return;
    setReview({
      index, action, newTopic,
      answer: action === "replace" ? turn.reply : "",
      topic: "",
      topicScoped: false,
      behaviorId: target?.behaviorId ?? "",
      responseId: target?.responseId ?? "",
    });
    setError(""); setNotice("");
  };

  const save = () => {
    if (!review) return;
    const turn = turns[review.index];
    if (!turn) return;
    try {
      const next = teachConversation(props.editingWorkspace, {
        action: review.action, input: turn.input, answer: review.answer, language,
        behaviorId: review.behaviorId, responseId: review.responseId,
        previousReply: turn.reply, topic: review.topic, topicScoped: review.topicScoped,
      });
      if (props.replaceWorkspace(next)) {
        setNotice("Saved to this Package. The conversation resets to test the updated Brain.");
        setReview(null);
        setError("");
      } else setError("Could not save the answer. Your draft is still here.");
    } catch (cause) { setError(String(cause)); }
  };

  const canTeach = props.editingWorkspace.packages.find((pkg) => pkg.manifest.id === props.editingWorkspace.selectedPackageId)?.manifest.kind === "standard";

  return <div className="page-stack teach-page">
    <section className="panel teach-header">
      <div><h2>Teach by talking</h2><p>Chat with the real GVYA Engine. Correct a reply, add variety, or teach a new line without opening a Behavior form.</p></div>
      <div className="inline-actions"><span className={`chip ${ready ? "success-chip" : ""}`}>{ready ? "Engine ready" : busy ? "Preparing…" : "Not ready"}</span><button onClick={reset} disabled={busy}>Start over</button></div>
    </section>
    {!canTeach ? <section className="panel"><p>Teach works with Standard Packages. Open Fallback Behaviors for fallback responses.</p><button onClick={props.onOpenBehaviors}>Open Behaviors</button></section> : <section className="panel teach-chat">
      {notice && <div className="success-row" role="status">{notice}</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}
      {turns.length === 0 && <div className="teach-empty"><strong>Start a conversation</strong><p>Write what a player might say to the NPC. Its actual reply appears here, with simple ways to improve it.</p></div>}
      <div className="teach-transcript" aria-live="polite">
        {turns.map((turn, index) => {
          const target = teachResponseTarget(props.editingWorkspace, turn.result.behavior, turn.reply, language);
          const isApproved = approved.includes(index);
          return <div className="teach-exchange" key={index}>
            <div className="teach-bubble user"><span>Player</span><p>{turn.input}</p></div>
            <div className="teach-bubble npc"><span>NPC</span><p>{turn.reply}</p>
              {!isApproved && <div className="teach-feedback">
                <button className="compact" onClick={() => { setApproved((rows) => [...rows, index]); if (review?.index === index) setReview(null); }}>Looks good</button>
                {target && <button className="compact" onClick={() => beginReview(index, "variation")}>Add alternative</button>}
                {target?.canReplace && <button className="compact" onClick={() => beginReview(index, "replace")}>Correct reply</button>}
                <button className="compact" onClick={() => beginReview(index, "new")}>New answer</button>
                <button className="compact" onClick={() => beginReview(index, "new", true)}>New topic</button>
              </div>}
              {!target && !isApproved && <p className="teach-hint">This reply is not editable as a normal response in the current Package. You can teach a new line here, or open its owning Package in Behaviors.</p>}
              {review?.index === index && <div className="teach-review">
                <strong>{review.action === "variation" ? "Add a different way to say it" : review.action === "replace" ? "Correct this answer" : review.newTopic ? "Start a new topic" : "Teach a new answer"}</strong>
                <label className="field"><span>NPC should say</span><textarea rows={3} value={review.answer} onChange={(e) => setReview({ ...review, answer: e.target.value })} placeholder="Write the NPC's reply…" /></label>
                {(review.newTopic || review.topic) && <label className="field"><span>Topic name</span><input value={review.topic} onChange={(e) => setReview({ ...review, topic: e.target.value })} placeholder="e.g. village.market" /></label>}
                <details className="teach-advanced"><summary>Advanced</summary>
                  {review.action === "new" && <>
                    {!review.newTopic && <label className="field"><span>Optional topic</span><input value={review.topic} onChange={(e) => setReview({ ...review, topic: e.target.value })} placeholder="Leave blank for a general answer" /></label>}
                    <label className="check-row"><input type="checkbox" checked={review.topicScoped} onChange={(e) => setReview({ ...review, topicScoped: e.target.checked })} /> Only match while this topic is active</label>
                    <p className="tiny muted">New answers start with the player's exact message as semantic evidence. If an existing intent still wins, adjust its structural patterns in Behaviors.</p>
                  </>}
                  {review.action !== "new" && <p className="tiny muted">This edits the existing response in {review.behaviorId}, without changing its matching rules or other languages.</p>}
                </details>
                <div className="button-row"><button className="primary" disabled={!review.answer.trim() || (review.newTopic && !review.topic.trim())} onClick={save}>Save answer</button><button onClick={() => setReview(null)}>Cancel</button></div>
              </div>}
            </div>
          </div>;
        })}
      </div>
      <div className="teach-composer"><label className="field"><span>Player message</span><textarea rows={2} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder="What would someone say to this NPC?" /></label><button className="primary" disabled={busy || !ready || !input.trim()} onClick={() => void send()}>{busy ? "Working…" : "Send"}</button></div>
      <details className="teach-advanced teach-runtime-options"><summary>Advanced · language and host context</summary>
        <label className="field"><span>Language used for saved answers</span><select value={language} onChange={(e) => { setReview(null); setLanguage(e.target.value); }}>{props.editingWorkspace.languages.map((row) => <option key={row} value={row}>{row}</option>)}</select></label>
        <p className="tiny muted">Simulation language is selected by the compiled Engine and conversation state. This setting controls only which localized text you author.</p>
        <label className="field"><span>Host context values (JSON)</span><textarea className="code-textarea" rows={3} value={contextText} onChange={(e) => setContextText(e.target.value)} /></label>
        {ready && <span className="mono tiny">Engine {ready.engine} · source {ready.sourceFingerprint.slice(0, 12)}</span>}
        <div className="button-row"><button onClick={props.onOpenBehaviors}>Edit Behaviors</button><button onClick={props.onOpenSimulate}>Full simulator and diagnostics</button></div>
      </details>
    </section>}
  </div>;
}
