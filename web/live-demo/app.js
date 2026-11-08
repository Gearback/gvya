import { GvyaRuntime, WasmRuntimeBackend, unsignedDevelopmentOpenOptions } from "./sdk/index.js";

const status = document.querySelector("#runtime-status");
const stateBadge = status.parentElement;
const launcher = document.querySelector("#chat-launcher");
const panel = document.querySelector("#chat-panel");
const closeButton = document.querySelector("#chat-close");
const soundButton = document.querySelector("#chat-sound");
const scrim = document.querySelector("#scrim");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#chat-input");
const sendButton = document.querySelector("#send-button");
const messages = document.querySelector("#messages");
const suggestions = document.querySelector("#suggestions");

let runtime;
let conversationState;
let busy = true;
let openingShown = false;
let loadingRow;
let loadFailed = false;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const soundKey = "gvya-demo-message-sound";
let soundEnabled = readSoundPreference();
let audioContext;

syncSoundButton();
setInteractionEnabled(false);
bootstrap().catch((error) => {
  console.error(error);
  loadFailed = true;
  status.textContent = "Runtime failed to load";
  stateBadge.classList.add("error");
  loadingRow?.remove();
  loadingRow = undefined;
  if (panel.classList.contains("open")) {
    appendBubble("bot", "The GVYA runtime could not load. Please refresh the page and try again.", "ltr");
  }
});

async function bootstrap() {
  const [wasmResponse, artifactResponse] = await Promise.all([
    fetch("./gvya-ffi-v1.wasm"),
    fetch("./gvya-bot.gvya"),
  ]);
  requireResponse(wasmResponse);
  requireResponse(artifactResponse);
  const [wasmBytes, artifactBytes] = await Promise.all([
    wasmResponse.arrayBuffer(),
    artifactResponse.arrayBuffer(),
  ]);
  const backend = await WasmRuntimeBackend.instantiate(wasmBytes);
  runtime = await GvyaRuntime.open(new Uint8Array(artifactBytes), backend, unsignedDevelopmentOpenOptions());
  const info = await runtime.info();
  status.textContent = `Runtime ready · ${info.enabled_languages.length} sample languages loaded`;
  stateBadge.classList.add("ready");
  loadingRow?.remove();
  loadingRow = undefined;

  if (panel.classList.contains("open")) {
    await showOpening();
  } else {
    setInteractionEnabled(true);
  }
}

function requireResponse(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${response.url}`);
  return response;
}

async function openChat() {
  panel.classList.add("open");
  scrim.classList.add("open");
  panel.setAttribute("aria-hidden", "false");
  launcher.setAttribute("aria-expanded", "true");
  primeSound();

  if (loadFailed) {
    if (messages.childElementCount === 0) {
      appendBubble("bot", "The GVYA runtime could not load. Please refresh the page and try again.", "ltr");
    }
    return;
  }

  if (!runtime) {
    showRuntimeLoading();
    return;
  }

  if (!openingShown) await showOpening();
  window.setTimeout(() => input.focus(), 50);
}

function showRuntimeLoading() {
  setInteractionEnabled(false);
  if (loadingRow?.isConnected) return;
  loadingRow = appendBubble("bot", "Loading GVYA runtime…", "ltr");
}

async function showOpening() {
  if (!runtime || openingShown) return;
  openingShown = true;
  loadingRow?.remove();
  loadingRow = undefined;
  setInteractionEnabled(false);
  const typing = appendTyping();
  const typingStarted = performance.now();
  try {
    // Let the browser paint the typing dots before invoking synchronous WASM work.
    await pause(40);
    const result = await runtime.openConversation({
      format: "gvya.runtime.open",
      version: 1,
      context: { values: {}, available_capabilities: [], visible_references: [] },
      seed: null,
    });
    conversationState = result.state;
    await displayReplies(result.response, typing, typingStarted,
      "Hi — I’m GVYA. Ask me what GVYA is or what you can build with it.");
  } catch (error) {
    console.error(error);
    typing.remove();
    appendBubble("bot", "Hi — I’m GVYA. Ask me what GVYA is or what you can build with it.", "ltr");
  } finally {
    setInteractionEnabled(true);
    if (panel.classList.contains("open")) window.setTimeout(() => input.focus(), 50);
  }
}

function closeChat() {
  panel.classList.remove("open");
  scrim.classList.remove("open");
  panel.setAttribute("aria-hidden", "true");
  launcher.setAttribute("aria-expanded", "false");
  launcher.focus();
}

launcher.addEventListener("click", openChat);
closeButton.addEventListener("click", closeChat);
scrim.addEventListener("click", closeChat);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && panel.classList.contains("open")) closeChat();
});

suggestions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-suggestion]");
  if (!button || busy) return;
  input.value = button.dataset.suggestion ?? "";
  form.requestSubmit();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || busy || !runtime) return;
  appendBubble("user", text, directionFor(text));
  input.value = "";
  setInteractionEnabled(false);
  primeSound();
  const typing = appendTyping();
  const typingStarted = performance.now();
  try {
    // Paint the user message and active typing indicator before the WASM turn.
    await pause(40);
    const result = await runtime.turn({
      format: "gvya.runtime.turn",
      version: 1,
      utterance: { text },
      context: { values: {}, available_capabilities: [], visible_references: [] },
      ...(conversationState === undefined ? {} : { state: conversationState }),
      seed: null,
    });
    conversationState = result.state;
    await displayReplies(result.response, typing, typingStarted,
      "GVYA returned no text response for this turn.", true);
  } catch (error) {
    console.error(error);
    typing.remove();
    appendBubble("bot", "The local GVYA runtime could not complete that turn.", "ltr");
  } finally {
    setInteractionEnabled(true);
    input.focus();
  }
});


function pause(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shouldAnimate() {
  return panel.classList.contains("open") && !document.hidden && !reducedMotion.matches;
}

// Presentation pacing is host-only. The GVYA turn and its deterministic result are unchanged.
async function displayReplies(response, initialTyping, initialStarted, fallback, notify = false) {
  const replies = extractTextItems(response);
  const items = replies.length ? replies : [{ text: fallback, language: "" }];

  for (const [index, reply] of items.entries()) {
    const typing = index === 0 ? initialTyping : appendTyping();
    const started = index === 0 ? initialStarted : performance.now();
    const minimum = shouldAnimate()
      ? (index === 0
        ? Math.min(1100, 570 + reply.text.length * 1.6)
        : Math.min(850, 320 + reply.text.length * 1.3))
      : 0;
    const remaining = minimum - (performance.now() - started);
    if (remaining > 0) await pause(remaining);

    typing.remove();
    const row = appendBubble("bot", "", directionFor(reply.text, reply.language), index > 0);
    if (notify && index === 0) playReplySound();
    await revealReply(row.firstElementChild, reply.text);
  }
}

function revealReply(bubble, text) {
  if (!shouldAnimate() || text.length < 10) {
    bubble.textContent = text;
    return Promise.resolve();
  }

  // Grapheme segmentation prevents Persian diacritics and emoji from breaking mid-character.
  const glyphs = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].map((item) => item.segment)
    : Array.from(text);
  const duration = Math.min(1500, Math.max(350, glyphs.length * 11));
  bubble.setAttribute("aria-hidden", "true");

  return new Promise((resolve) => {
    const start = performance.now();
    let frame;
    let lastCount = 0;
    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      window.cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      bubble.textContent = text;
      bubble.removeAttribute("aria-hidden");
      messages.scrollTop = messages.scrollHeight;
      resolve();
    }
    function onVisibility() {
      if (document.hidden) finish();
    }
    function paint(now) {
      if (!shouldAnimate()) return finish();
      const fraction = Math.min(1, (now - start) / duration);
      const count = Math.min(glyphs.length, Math.max(1, Math.ceil(fraction * glyphs.length)));
      if (count !== lastCount) {
        bubble.textContent = glyphs.slice(0, count).join("");
        lastCount = count;
        messages.scrollTop = messages.scrollHeight;
      }
      if (fraction === 1) finish();
      else frame = window.requestAnimationFrame(paint);
    }
    document.addEventListener("visibilitychange", onVisibility);
    frame = window.requestAnimationFrame(paint);
  });
}

function readSoundPreference() {
  try {
    return window.localStorage.getItem(soundKey) !== "off";
  } catch {
    return true;
  }
}

function syncSoundButton() {
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.setAttribute("aria-label", soundEnabled ? "Mute message sound" : "Enable message sound");
  soundButton.title = soundEnabled ? "Mute message sound" : "Enable message sound";
}

function primeSound() {
  if (!soundEnabled) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  try {
    if (!audioContext) audioContext = new Context();
    if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
  } catch {
    // Sound is optional: unsupported devices must never interrupt a conversation.
  }
}

function playReplySound() {
  if (!soundEnabled || !audioContext || audioContext.state !== "running" ||
      document.hidden || !panel.classList.contains("open")) return;
  try {
    const now = audioContext.currentTime;
    for (const tone of [{ frequency: 784, volume: 0.009 }, { frequency: 1176, volume: 0.003 }]) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(tone.frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(tone.volume, now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.20);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now);
      oscillator.stop(now + 0.21);
    }
  } catch {
    // Audio is an enhancement, not a dependency of the UI.
  }
}

soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  try {
    window.localStorage.setItem(soundKey, soundEnabled ? "on" : "off");
  } catch {
    // Still allow toggling for this page session if storage is unavailable.
  }
  syncSoundButton();
  if (soundEnabled) primeSound();
});

function extractTextItems(response) {
  const output = [];
  if (!response || typeof response !== "object" || !Array.isArray(response.messages)) return output;
  for (const message of response.messages) {
    if (!message || !Array.isArray(message.items)) continue;
    for (const item of message.items) {
      if (item?.type === "text" && typeof item.text === "string" && item.text.trim()) {
        output.push({ text: item.text, language: typeof item.language === "string" ? item.language : "" });
      }
    }
  }
  return output;
}

function appendBubble(role, text, dir, continuation = false) {
  const row = document.createElement("div");
  row.className = `message-row ${role}${continuation ? " continuation" : ""}`;
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.dir = dir;
  bubble.textContent = text;
  row.append(bubble);
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return row;
}

function appendTyping() {
  const row = document.createElement("div");
  row.className = "message-row bot";
  row.setAttribute("aria-label", "GVYA is responding");
  row.innerHTML = '<div class="bubble typing"><i></i><i></i><i></i></div>';
  messages.append(row);
  messages.scrollTop = messages.scrollHeight;
  return row;
}

function directionFor(text, language = "") {
  if (/^(fa|ar|ur)(-|$)/i.test(language)) return "rtl";
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u.test(text) ? "rtl" : "ltr";
}

function setInteractionEnabled(enabled) {
  busy = !enabled;
  input.disabled = !enabled;
  sendButton.disabled = !enabled;
  suggestions.querySelectorAll("button").forEach((button) => { button.disabled = !enabled; });
}

window.addEventListener("pagehide", () => { runtime?.close().catch(() => {}); });
