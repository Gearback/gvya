import { useEffect, useMemo, useRef, useState } from "react";
import { auditWorkspace } from "./audit.js";
import { assetFileKey, assetFilesForBrain, botAssetOwner, liveAssetOwnerKeys, packagePreviewAssetOwnerKeys, projectAssetOwner, selectedBrainAssetOwnerKeys, selectedPackageAssetOwner, sharedAssetOwner } from "./asset-files.js";
import { loadStudioContent, saveStudioContent } from "./studio-content.js";
import { downloadSelectedBotFolderZip, downloadSelectedPackageFolderZip } from "./folder-export.js";
import { BuildView, SimulateView } from "./studio-runtime-views.js";
import { TeachView } from "./studio-teach-view.js";
import { CapabilitiesView } from "./studio-capability-views.js";
import { AuthorView } from "./studio-behavior-views.js";
import { PackageSourceView } from "./studio-source-view.js";
import { AssetsView, AuditView, PackageOverviewView } from "./studio-content-views.js";
import {
  BotOverviewView, BotPackagesView, BotSettingsView, GlobalSettingsView, ProjectView, ProjectsView, SharedPackagesView,
  selectBotWorkspace, selectPackageWorkspace, selectProjectWorkspace,
} from "./studio-management-views.js";
import {
  BOT_ROUTES, PACKAGE_ROUTES, Breadcrumb, ContextTabs, NavButton, navigationContextForRoute, normalizeHistoryLocation,
  readBrowserHistoryLocation, restoreHistorySelection, studioHistoryHash, studioHistoryLocation,
  type PackageNavigationContext, type StudioHistoryLocation,
} from "./studio-navigation.js";
import {
  applyEditingBrain, applyResolvedBrain, createStarterStudioWorkspace,
  botMissingMatcherLanguages, resolveEditingBrain, resolvePackagePreview, resolveSelectedBrain, selectedBot, selectedPackageMissingMatcherLanguages, selectedProject,
} from "./studio-model.js";
import type {
  AssetDefinition, StudioBrainWorkspace, StudioAssetFile, StudioRoute, StudioWorkspace,
} from "./types.js";
import { cloneBrainWorkspace, selectedPackage, touch } from "./workspace.js";

type ToastKind = "success" | "error" | "info";
interface ToastNotice { id: number; message: string; kind: ToastKind; }
const TOAST_AUTOHIDE_MS: Record<ToastKind, number> = { success: 2200, info: 3500, error: 6000 };
type Mutate = (mutator: (draft: StudioBrainWorkspace) => void) => boolean;

function loadInitialStudioNavigation(): { studio: StudioWorkspace; location: StudioHistoryLocation } {
  const base = createStarterStudioWorkspace();
  const raw = readBrowserHistoryLocation();
  const location = raw ? normalizeHistoryLocation(base, raw) : studioHistoryLocation(base, "projects", "global");
  return { studio: raw ? restoreHistorySelection(base, location) : base, location };
}

export function App() {
  const initialNavigation = useRef<{ studio: StudioWorkspace; location: StudioHistoryLocation } | null>(null);
  if (!initialNavigation.current) initialNavigation.current = loadInitialStudioNavigation();
  const [studio, setStudio] = useState<StudioWorkspace>(() => initialNavigation.current!.studio);
  const [route, setRoute] = useState<StudioRoute>(() => initialNavigation.current!.location.route);
  const [packageContext, setPackageContext] = useState<PackageNavigationContext>(() => initialNavigation.current!.location.packageContext);
  const [assetFiles, setAssetFiles] = useState<StudioAssetFile[]>([]);
  const [contentReady, setContentReady] = useState(false);
  const [contentLoadError, setContentLoadError] = useState("");
  const [contentLoadAttempt, setContentLoadAttempt] = useState(0);
  const [toast, setToast] = useState<ToastNotice | null>(null);
  const [simulationDraft, setSimulationDraft] = useState("");
  const toastSerial = useRef(0);
  const contentRevision = useRef("");
  const contentSaveChain = useRef<Promise<void>>(Promise.resolve());
  const skipLoadedContentSave = useRef(true);
  const studioRef = useRef(studio);
  const assetFilesRef = useRef(assetFiles);
  studioRef.current = studio;
  assetFilesRef.current = assetFiles;

  const showToast = (message: string, kind: ToastKind = inferToastKind(message)) => {
    const notice = { id: ++toastSerial.current, message, kind };
    setToast((current) => current?.kind === "error" && kind !== "error" ? current : notice);
  };
  const setStatus = (message: string) => showToast(message);
  const downloadPackageFolder = (): void => { void downloadSelectedPackageFolderZip(studioRef.current, assetFilesRef.current).then(() => showToast("Package ZIP downloaded", "success")).catch((error) => showToast(String(error), "error")); };
  const downloadBotFolder = (): void => { void downloadSelectedBotFolderZip(studioRef.current, assetFilesRef.current).then(() => showToast("Bot ZIP downloaded", "success")).catch((error) => showToast(String(error), "error")); };

  const applyStudio = (fn: (current: StudioWorkspace) => StudioWorkspace, message?: string): boolean => {
    const previous = studioRef.current;
    try {
      const next = fn(previous);
      if (JSON.stringify(next) !== JSON.stringify(previous)) {
        studioRef.current = next;
        setStudio(next);
        const liveOwners = liveAssetOwnerKeys(next);
        setAssetFiles((current) => { const filtered = current.filter((file) => liveOwners.has(file.owner_key)); assetFilesRef.current = filtered; return filtered; });
      }
      if (message) showToast(message, "success");
      return true;
    } catch (error) {
      showToast(String(error), "error");
      return false;
    }
  };

  const editingBrain = useMemo(() => {
    try { return resolveEditingBrain(studio); } catch { return null; }
  }, [studio]);
  const selectedBrain = useMemo(() => {
    try { return resolveSelectedBrain(studio); } catch { return null; }
  }, [studio]);
  const packagePreview = useMemo<{ workspace: StudioBrainWorkspace | null; error: string }>(() => {
    if (route !== "package-simulate" && route !== "teach") return { workspace: null, error: "" };
    try { return { workspace: resolvePackagePreview(studio), error: "" }; }
    catch (error) { return { workspace: null, error: String(error) }; }
  }, [route, studio]);
  const selectedAssetFiles = useMemo(() => selectedBrain ? assetFilesForBrain(selectedBrain, selectedBrainAssetOwnerKeys(studio), assetFiles) : [], [selectedBrain, studio, assetFiles]);
  const packagePreviewAssetFiles = useMemo(() => packagePreview.workspace ? assetFilesForBrain(packagePreview.workspace, packagePreviewAssetOwnerKeys(studio, packagePreview.workspace), assetFiles) : [], [packagePreview.workspace, studio, assetFiles]);
  const editingAssetOwner = useMemo(() => { try { return selectedPackageAssetOwner(studio); } catch { return ""; } }, [studio]);
  const issues = useMemo(() => editingBrain ? auditWorkspace(editingBrain) : [], [editingBrain]);

  const mutateBrain: Mutate = (mutator) => {
    const previousStudio = studioRef.current;
    try {
      const before = resolveEditingBrain(previousStudio);
      const after = cloneBrainWorkspace(before);
      mutator(after);
      if (JSON.stringify(after) === JSON.stringify(before)) return true;
      const next = applyEditingBrain(previousStudio, before, touch(after));
      const nextAssets = reconcileAssetOwners(previousStudio, before, after, assetFilesRef.current);
      studioRef.current = next; assetFilesRef.current = nextAssets;
      setStudio(next); setAssetFiles(nextAssets);
      return true;
    } catch (error) { setStatus(String(error)); return false; }
  };
  const replaceBrain = (nextBrain: StudioBrainWorkspace): boolean => {
    const previousStudio = studioRef.current;
    try {
      const before = resolveEditingBrain(previousStudio);
      const next = applyEditingBrain(previousStudio, before, nextBrain);
      const nextAssets = reconcileAssetOwners(previousStudio, before, nextBrain, assetFilesRef.current);
      studioRef.current = next;
      assetFilesRef.current = nextAssets;
      setStudio(next);
      setAssetFiles(nextAssets);
      return true;
    } catch (error) {
      showToast(String(error), "error");
      return false;
    }
  };
  const mutateSelectedBrain: Mutate = (mutator) => {
    const previousStudio = studioRef.current;
    try {
      const before = resolveSelectedBrain(previousStudio); const after = cloneBrainWorkspace(before); mutator(after);
      if (JSON.stringify(after) === JSON.stringify(before)) return true;
      const next = applyResolvedBrain(previousStudio, before, touch(after));
      const nextAssets = reconcileAssetOwners(previousStudio, before, after, assetFilesRef.current);
      studioRef.current = next; assetFilesRef.current = nextAssets;
      setStudio(next); setAssetFiles(nextAssets); return true;
    } catch (error) { setStatus(String(error)); return false; }
  };

  useEffect(() => {
    let active = true;
    setContentLoadError("");
    void loadStudioContent().then((snapshot) => {
      if (!active) return;
      const raw = readBrowserHistoryLocation();
      const location = raw ? normalizeHistoryLocation(snapshot.workspace, raw) : studioHistoryLocation(snapshot.workspace, "projects", "global");
      const restored = raw ? restoreHistorySelection(snapshot.workspace, location) : snapshot.workspace;
      contentRevision.current = snapshot.revision;
      studioRef.current = restored; assetFilesRef.current = snapshot.assetFiles;
      setStudio(restored); setAssetFiles(snapshot.assetFiles); setRoute(location.route); setPackageContext(location.packageContext);
      setContentReady(true);
    }).catch((error) => {
      if (!active) return;
      setContentLoadError(String(error));
    });
    return () => { active = false; };
  }, [contentLoadAttempt]);
  useEffect(() => {
    if (!contentReady) return;
    if (skipLoadedContentSave.current) {
      skipLoadedContentSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      const workspaceSnapshot = studio;
      const assetSnapshot = [...assetFiles];
      contentSaveChain.current = contentSaveChain.current.then(async () => {
        contentRevision.current = await saveStudioContent(workspaceSnapshot, assetSnapshot, contentRevision.current);
      }).catch((error) => showToast(`Autosave failed; content remains only in memory: ${String(error)}`, "error"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [studio, assetFiles, contentReady]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(
      () => setToast((current) => current?.id === toast.id ? null : current),
      TOAST_AUTOHIDE_MS[toast.kind],
    );
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!contentReady) return;
    const location = studioHistoryLocation(studio, route, packageContext);
    window.history.replaceState(location, "", studioHistoryHash(location));
  }, [studio, route, packageContext, contentReady]);
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const raw = event.state as StudioHistoryLocation | null;
      if (!raw || raw.kind !== "gvya.studio.location" || raw.version !== 1) return;
      const normalized = normalizeHistoryLocation(studioRef.current, raw);
      const restored = restoreHistorySelection(studioRef.current, normalized);
      studioRef.current = restored;
      setStudio(restored);
      setPackageContext(normalized.packageContext);
      setRoute(normalized.route);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const pushNavigation = (nextStudio: StudioWorkspace, nextRoute: StudioRoute, nextContext: PackageNavigationContext) => {
    const guardedRoute = matcherGuardedRoute(nextStudio, nextRoute);
    const location = studioHistoryLocation(nextStudio, guardedRoute, nextContext);
    window.history.pushState(location, "", studioHistoryHash(location));
    setPackageContext(nextContext);
    setRoute(guardedRoute);
  };
  const navigate = (nextRoute: StudioRoute) => {
    const nextContext = navigationContextForRoute(nextRoute, packageContext);
    if (nextRoute === route && nextContext === packageContext) return;
    pushNavigation(studio, nextRoute, nextContext);
  };
  const navigateWithStudio = (nextStudio: StudioWorkspace, nextRoute: StudioRoute, nextContext: PackageNavigationContext) => {
    studioRef.current = nextStudio;
    setStudio(nextStudio);
    pushNavigation(nextStudio, nextRoute, nextContext);
  };

  const saveAssetFile = (ownerKey: string, packageId: string, previousSource: string | null, asset: AssetDefinition, replacement: File | null): void => {
    const previousKey = previousSource === null ? null : assetFileKey(ownerKey, previousSource);
    const nextKey = assetFileKey(ownerKey, asset.source);
    setAssetFiles((current) => {
      const existing = current.find((file) => assetFileKey(file.owner_key, file.source) === previousKey) ?? null;
      if (!replacement && !existing) throw new Error(`Choose source bytes for ${asset.source}.`);
      const blob = replacement ? new Blob([replacement], { type: asset.media_type }) : existing!.blob;
      const next = current.filter((file) => {
        const key = assetFileKey(file.owner_key, file.source);
        return key !== previousKey && key !== nextKey;
      });
      next.push({ owner_key: ownerKey, package_id: packageId, source: asset.source, media_type: asset.media_type, blob });
      assetFilesRef.current = next;
      return next;
    });
  };
  const removeAssetFile = (ownerKey: string, source: string): void => {
    const key = assetFileKey(ownerKey, source);
    setAssetFiles((current) => {
      const next = current.filter((file) => assetFileKey(file.owner_key, file.source) !== key);
      assetFilesRef.current = next; return next;
    });
  };

  if (!contentReady) return <StudioContentGate error={contentLoadError} onRetry={() => setContentLoadAttempt((attempt) => attempt + 1)} />;

  const project = (() => { try { return selectedProject(studio); } catch { return null; } })();
  const bot = project ? (() => { try { return selectedBot(studio, project); } catch { return null; } })() : null;
  const contextKind: "bot" | "package" | null = BOT_ROUTES.has(route) ? "bot" : PACKAGE_ROUTES.has(route) ? "package" : null;
  const missingMatcherLanguages = contextKind === "bot" && project && bot
    ? botMissingMatcherLanguages(studio, project, bot)
    : contextKind === "package"
      ? (() => { try { return selectedPackageMissingMatcherLanguages(studio); } catch { return []; } })()
      : [];

  const openProject = (projectId: string) => {
    try { navigateWithStudio(selectProjectWorkspace(studio, projectId), "project", "project"); }
    catch (error) { setStatus(String(error)); }
  };
  const openBot = (botId: string) => {
    try { navigateWithStudio(selectBotWorkspace(studio, botId), "bot", "bot"); }
    catch (error) { setStatus(String(error)); }
  };
  const openPackage = (scope: "shared" | "project" | "bot", packageId: string, context: PackageNavigationContext) => {
    try { navigateWithStudio(selectPackageWorkspace(studio, scope, packageId), "package-overview", context); }
    catch (error) { setStatus(String(error)); }
  };
  return <div className="app-shell">
    <aside className="sidebar" aria-label="GVYA Studio navigation">
      <div className="brand-block"><div><strong>GVYA <span className="brand-soft">Studio</span></strong><span className="brand-tagline">Conversational Bot Builder</span></div></div>
      <nav className="nav-stack">
        <NavButton route="projects" current={route} onClick={navigate} label="Projects" />
        <NavButton route="packages" current={route} onClick={navigate} label="Shared Packages" />
        <NavButton route="settings" current={route} onClick={navigate} label="Settings" />
      </nav>
    </aside>
    <main className="main-shell">
      <header className="topbar"><Breadcrumb studio={studio} project={project} bot={bot} route={route} packageContext={packageContext} onRoute={navigate} /></header>
      {contextKind && <ContextTabs kind={contextKind} route={route} setRoute={navigate} overviewOnly={missingMatcherLanguages.length > 0} packageKind={editingBrain ? selectedPackage(editingBrain).manifest.kind : undefined} />}
      <div className="content-area">
        {route === "projects" && <ProjectsView studio={studio} applyStudio={applyStudio} openProject={openProject} />}
        {route === "packages" && <SharedPackagesView studio={studio} applyStudio={applyStudio} openPackage={(scope, id) => openPackage(scope, id, "global")} />}
        {route === "settings" && <GlobalSettingsView studio={studio} applyStudio={applyStudio} />}
        {(route === "project" || route === "project-packages") && project && <ProjectView studio={studio} route={route} onRoute={navigate} applyStudio={applyStudio} openBot={openBot} openPackage={(scope, id) => openPackage(scope, id, "project")} />}
        {project && bot && route === "bot" && <BotOverviewView studio={studio} applyStudio={applyStudio} onOpenPackages={() => navigate("bot-packages")} onSimulate={() => navigate("simulate")} onDownloadArchive={downloadBotFolder} />}
        {project && bot && route === "bot-packages" && <BotPackagesView studio={studio} applyStudio={applyStudio} openPackage={(scope, id) => openPackage(scope, id, "bot")} />}
        {editingBrain && route === "package-overview" && <PackageOverviewView studio={studio} workspace={editingBrain} issues={issues} missingMatcherLanguages={missingMatcherLanguages} setRoute={navigate} onDownloadArchive={downloadPackageFolder} />}
        {editingBrain && packagePreview.workspace && route === "teach" && <TeachView editingWorkspace={editingBrain} simulationWorkspace={packagePreview.workspace} assetFiles={packagePreviewAssetFiles} replaceWorkspace={replaceBrain} onOpenBehaviors={() => navigate("author")} onOpenSimulate={() => navigate("package-simulate")} />}
        {packagePreview.error && route === "teach" && <section className="panel"><h2>Teach unavailable</h2><div className="error-banner">{packagePreview.error}</div></section>}
        {editingBrain && route === "author" && <AuthorView workspace={editingBrain} mutate={mutateBrain} replaceWorkspace={replaceBrain} issues={issues} onTryUtterance={(text) => { setSimulationDraft(text); navigate("package-simulate"); }} />}
        {editingBrain && route === "capabilities" && <CapabilitiesView workspace={editingBrain} mutate={mutateBrain} replaceWorkspace={replaceBrain} issues={issues} />}
        {editingBrain && route === "source" && <PackageSourceView workspace={editingBrain} mutate={mutateBrain} />}
        {editingBrain && route === "assets" && editingAssetOwner && <AssetsView workspace={editingBrain} mutate={mutateBrain} assetOwner={editingAssetOwner} assetFiles={assetFiles} saveAssetFile={saveAssetFile} removeAssetFile={removeAssetFile} />}
        {editingBrain && route === "audit" && <AuditView workspace={editingBrain} issues={issues} setRoute={navigate} />}
        {packagePreview.workspace && route === "package-simulate" && <SimulateView target="package" workspace={packagePreview.workspace} assetFiles={packagePreviewAssetFiles} initialInput={simulationDraft} />}
        {packagePreview.error && route === "package-simulate" && <div className="page-stack"><section className="panel"><h2>Package preview unavailable</h2><div className="error-banner">{packagePreview.error}</div></section></div>}
        {selectedBrain && route === "simulate" && <SimulateView target="bot" workspace={selectedBrain} assetFiles={selectedAssetFiles} initialInput={simulationDraft} />}
        {selectedBrain && route === "build" && <BuildView workspace={selectedBrain} assetFiles={selectedAssetFiles} mutate={mutateSelectedBrain} setStatus={setStatus} />}
        {project && bot && route === "bot-settings" && <BotSettingsView studio={studio} applyStudio={applyStudio} />}
      </div>
    </main>
    {toast && <Toast notice={toast} />}
  </div>;

}

function StudioContentGate(props: { error: string; onRetry: () => void }) {
  const failed = props.error !== "";
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand-block"><div><strong>GVYA <span className="brand-soft">Studio</span></strong><span className="brand-tagline">Conversational Bot Builder</span></div></div></aside>
    <main className="main-shell"><div className="content-area"><div className="page-stack">
      <section className="page-heading"><div><h1>{failed ? "Studio content could not be opened" : "Opening Studio content…"}</h1><p>{failed ? "No fallback Project has been opened. Resolve the content error below, then retry." : "Reading portable Projects, Bots, Packages, and Language/Matcher Profiles."}</p></div></section>
      {failed && <section className="panel"><div className="error-banner">{props.error}</div><div className="button-row"><button className="primary" onClick={props.onRetry}>Retry</button></div></section>}
    </div></div></main>
  </div>;
}

function matcherGuardedRoute(studio: StudioWorkspace, route: StudioRoute): StudioRoute {
  try {
    if (BOT_ROUTES.has(route) && botMissingMatcherLanguages(studio).length > 0) return "bot";
    if (PACKAGE_ROUTES.has(route) && selectedPackageMissingMatcherLanguages(studio).length > 0) return "package-overview";
  } catch {
    // Existing ownership validation renders its own unavailable state.
  }
  return route;
}

function Toast(props: { notice: ToastNotice }) {
  const role = props.notice.kind === "error" ? "alert" : "status";
  return <div data-studio-transient-layer="toast" className={`toast toast-${props.notice.kind}`} role={role} aria-live={props.notice.kind === "error" ? "assertive" : "polite"}>
    <span>{props.notice.message}</span>
  </div>;
}

function inferToastKind(message: string): ToastKind {
  if (/(fail|error|invalid|missing|blocked|cannot|unable|not applied|exceeds|denied)/i.test(message)) return "error";
  if (/(saved|downloaded|created|imported|restored|applied|enabled|disabled|removed|selected|copied)/i.test(message)) return "success";
  return "info";
}
function reconcileAssetOwners(studio: StudioWorkspace, before: StudioBrainWorkspace, after: StudioBrainWorkspace, files: readonly StudioAssetFile[]): StudioAssetFile[] {
  const allowedOwners = selectedBrainAssetOwnerKeys(studio);
  const renamed = new Map<string, string>();
  for (let index = 0; index < Math.min(before.packages.length, after.packages.length); index += 1) {
    const previousId = before.packages[index]!.manifest.id;
    const nextId = after.packages[index]!.manifest.id;
    if (previousId !== nextId) renamed.set(previousId, nextId);
  }
  if (renamed.size === 0) return [...files];
  const project = studio.projects.find((row) => row.id === studio.selectedProjectId) ?? null;
  const bot = project?.bots.find((row) => row.id === studio.selectedBotId) ?? null;
  return files.map((file) => {
    const nextId = allowedOwners.has(file.owner_key) ? renamed.get(file.package_id) : undefined;
    if (!nextId) return file;
    const owner_key = file.owner_key.startsWith("shared:")
      ? sharedAssetOwner(nextId)
      : file.owner_key.startsWith("project:") && project
        ? projectAssetOwner(project.id, nextId)
        : file.owner_key.startsWith("bot:") && project && bot
          ? botAssetOwner(project.id, bot.id, nextId)
          : file.owner_key;
    return { ...file, owner_key, package_id: nextId };
  });
}
