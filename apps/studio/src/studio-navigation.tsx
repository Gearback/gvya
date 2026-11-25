import { botMissingMatcherLanguages, cloneStudioWorkspace, selectedPackageMissingMatcherLanguages } from "./studio-model.js";
import type { PackageKind, StudioBot, StudioPackage, StudioProject, StudioRoute, StudioWorkspace } from "./types.js";

export type PackageNavigationContext = "global" | "project" | "bot";
export interface StudioHistoryLocation {
  kind: "gvya.studio.location";
  version: 1;
  route: StudioRoute;
  projectId: string;
  botId: string;
  packageScope: "shared" | "project" | "bot";
  packageId: string;
  packageContext: PackageNavigationContext;
}

export const BOT_ROUTES = new Set<StudioRoute>(["bot", "bot-packages", "simulate", "build", "bot-settings"]);
export const PACKAGE_ROUTES = new Set<StudioRoute>(["package-overview", "teach", "author", "capabilities", "source", "assets", "package-simulate", "audit"]);
export const PROJECT_ROUTES = new Set<StudioRoute>(["project", "project-packages"]);
const ALL_STUDIO_ROUTES = new Set<StudioRoute>(["projects", "packages", "settings", "project", "project-packages", "bot", "bot-packages", "package-overview", "teach", "author", "capabilities", "source", "assets", "package-simulate", "audit", "simulate", "build", "bot-settings"]);
const PACKAGE_NAVIGATION_CONTEXTS = new Set<PackageNavigationContext>(["global", "project", "bot"]);
const PACKAGE_SCOPES = new Set<"shared" | "project" | "bot">(["shared", "project", "bot"]);

export function readBrowserHistoryLocation(): StudioHistoryLocation | null {
  if (typeof window === "undefined") return null;
  const value = window.history.state as Partial<StudioHistoryLocation> | null;
  if (!value || value.kind !== "gvya.studio.location" || value.version !== 1) return null;
  if (typeof value.route !== "string" || !ALL_STUDIO_ROUTES.has(value.route as StudioRoute)) return null;
  if (typeof value.packageContext !== "string" || !PACKAGE_NAVIGATION_CONTEXTS.has(value.packageContext as PackageNavigationContext)) return null;
  if (typeof value.packageScope !== "string" || !PACKAGE_SCOPES.has(value.packageScope as "shared" | "project" | "bot")) return null;
  for (const field of [value.projectId, value.botId, value.packageId]) if (typeof field !== "string") return null;
  return value as StudioHistoryLocation;
}

export function studioHistoryLocation(studio: StudioWorkspace, route: StudioRoute, packageContext: PackageNavigationContext): StudioHistoryLocation {
  return { kind: "gvya.studio.location", version: 1, route, projectId: studio.selectedProjectId, botId: studio.selectedBotId, packageScope: studio.selectedPackageScope, packageId: studio.selectedPackageId, packageContext };
}

function encodeStudioSegment(value: string): string { return encodeURIComponent(value || "_"); }
export function navigationContextForRoute(route: StudioRoute, current: PackageNavigationContext): PackageNavigationContext {
  if (PACKAGE_ROUTES.has(route)) return current;
  if (route === "packages") return "global";
  if (PROJECT_ROUTES.has(route)) return "project";
  if (BOT_ROUTES.has(route)) return "bot";
  return "global";
}
export function studioHistoryHash(location: StudioHistoryLocation): string {
  if (location.route === "projects") return "#/projects";
  if (location.route === "packages") return "#/packages";
  if (location.route === "settings") return "#/settings";
  const project = encodeStudioSegment(location.projectId);
  if (location.route === "project") return `#/projects/${project}/bots`;
  if (location.route === "project-packages") return `#/projects/${project}/packages`;
  const bot = encodeStudioSegment(location.botId);
  if (BOT_ROUTES.has(location.route)) return `#/projects/${project}/bots/${bot}/${location.route}`;
  if (PACKAGE_ROUTES.has(location.route)) {
    const packagePath = `${encodeStudioSegment(location.packageScope)}/${encodeStudioSegment(location.packageId)}`;
    if (location.packageContext === "bot") return `#/projects/${project}/bots/${bot}/packages/${packagePath}/${location.route}`;
    if (location.packageContext === "project") return `#/projects/${project}/packages/${packagePath}/${location.route}`;
    return `#/packages/${packagePath}/${location.route}`;
  }
  return "#/projects";
}

function packageLocationExists(studio: StudioWorkspace, location: StudioHistoryLocation): boolean {
  if (!location.packageId) return false;
  if (location.packageScope === "shared") return studio.shared_packages.some((pkg) => pkg.manifest.id === location.packageId);
  const project = studio.projects.find((row) => row.id === location.projectId);
  if (!project) return false;
  if (location.packageScope === "project") return project.packages.some((pkg) => pkg.manifest.id === location.packageId);
  const bot = project.bots.find((row) => row.id === location.botId);
  return Boolean(bot?.package && bot.package.manifest.id === location.packageId);
}

export function normalizeHistoryLocation(studio: StudioWorkspace, raw: StudioHistoryLocation): StudioHistoryLocation {
  const next = { ...raw };
  const project = studio.projects.find((row) => row.id === next.projectId);
  if ((PROJECT_ROUTES.has(next.route) || BOT_ROUTES.has(next.route) || PACKAGE_ROUTES.has(next.route)) && !project) return studioHistoryLocation(studio, "projects", "global");
  const bot = project?.bots.find((row) => row.id === next.botId);
  if ((BOT_ROUTES.has(next.route) || (PACKAGE_ROUTES.has(next.route) && next.packageContext === "bot")) && !bot) return studioHistoryLocation({ ...studio, selectedProjectId: project?.id ?? studio.selectedProjectId }, "project", "project");
  if (PACKAGE_ROUTES.has(next.route) && !packageLocationExists(studio, next)) return { ...next, route: next.packageContext === "bot" ? "bot-packages" : next.packageContext === "project" ? "project-packages" : "packages" };
  const probe = cloneStudioWorkspace(studio);
  probe.selectedProjectId = project?.id ?? probe.selectedProjectId;
  probe.selectedBotId = bot?.id ?? probe.selectedBotId;
  probe.selectedPackageScope = next.packageScope;
  probe.selectedPackageId = next.packageId;
  if (BOT_ROUTES.has(next.route) && project && bot && botMissingMatcherLanguages(probe, project, bot).length > 0) return { ...next, route: "bot" };
  if (PACKAGE_ROUTES.has(next.route) && selectedPackageMissingMatcherLanguages(probe).length > 0) return { ...next, route: "package-overview" };
  return next;
}

export function restoreHistorySelection(studio: StudioWorkspace, raw: StudioHistoryLocation): StudioWorkspace {
  const location = normalizeHistoryLocation(studio, raw);
  const next = cloneStudioWorkspace(studio);
  const project = next.projects.find((row) => row.id === location.projectId);
  if (project) {
    next.selectedProjectId = project.id;
    const bot = project.bots.find((row) => row.id === location.botId);
    if (bot) next.selectedBotId = bot.id;
  }
  if (packageLocationExists(next, location)) { next.selectedPackageScope = location.packageScope; next.selectedPackageId = location.packageId; }
  return next;
}

export function NavButton(props: { route: StudioRoute; current: StudioRoute; onClick: (route: StudioRoute) => void; label: string; badge?: number }) {
  return <button className={`nav-button ${props.current === props.route ? "active" : ""}`} onClick={() => props.onClick(props.route)}><span>{props.label}</span>{Boolean(props.badge) && <span className="nav-badge">{props.badge}</span>}</button>;
}

function breadcrumbPackage(studio: StudioWorkspace, project: StudioProject | null, bot: StudioBot | null): StudioPackage | undefined {
  const id = studio.selectedPackageId;
  if (studio.selectedPackageScope === "bot") return bot?.package.manifest.id === id ? bot.package : undefined;
  if (studio.selectedPackageScope === "project") return project?.packages.find((row) => row.manifest.id === id);
  return studio.shared_packages.find((row) => row.manifest.id === id);
}

function packageBreadcrumbProvenance(studio: StudioWorkspace, pkg: StudioPackage | undefined): string {
  if (!pkg) return "Package";
  if (studio.selectedPackageScope === "bot") return "Bot package";
  return studio.selectedPackageScope === "project" ? "Project package" : "Shared package";
}

export const BOT_ICON = "🤖";
export const PACKAGE_ICON = "📦";
export const FALLBACK_PACKAGE_ICON = "⛑️";

/** Fallback Packages are a separate last-resort layer, so they carry their own icon everywhere a Package is listed. */
export function packageIcon(kind: PackageKind): string { return kind === "fallback" ? FALLBACK_PACKAGE_ICON : PACKAGE_ICON; }

export function Breadcrumb(props: { studio: StudioWorkspace; project: StudioProject | null; bot: StudioBot | null; route: StudioRoute; packageContext: PackageNavigationContext; onRoute: (route: StudioRoute) => void }) {
  const segments: Array<{ label: string; icon?: string; onClick?: () => void }> = [];
  let provenance = "";
  if (props.route === "packages") segments.push({ label: "Shared Packages" });
  else if (props.route === "settings") segments.push({ label: "Settings" });
  else if (PACKAGE_ROUTES.has(props.route)) {
    if (props.packageContext === "global") segments.push({ label: "Shared Packages", onClick: () => props.onRoute("packages") });
    else {
      segments.push({ label: "Projects", onClick: () => props.onRoute("projects") });
      if (props.project) segments.push({ label: props.project.title || props.project.id, onClick: () => props.onRoute("project") });
      if (props.packageContext === "bot" && props.bot) segments.push({ label: props.bot.title || props.bot.id, icon: BOT_ICON, onClick: () => props.onRoute("bot") });
    }
    const selectedPkg = breadcrumbPackage(props.studio, props.project, props.bot);
    if (props.studio.selectedPackageId) segments.push({ label: props.studio.selectedPackageId, icon: packageIcon(selectedPkg?.manifest.kind ?? "standard") });
    provenance = packageBreadcrumbProvenance(props.studio, selectedPkg);
  } else {
    segments.push({ label: "Projects", onClick: () => props.onRoute("projects") });
    if (props.project && props.route !== "projects") {
      if (PROJECT_ROUTES.has(props.route)) segments.push({ label: props.project.title || props.project.id });
      else segments.push({ label: props.project.title || props.project.id, onClick: () => props.onRoute("project") });
      if (BOT_ROUTES.has(props.route) && props.bot) segments.push({ label: props.bot.title || props.bot.id, icon: BOT_ICON });
    }
  }
  return <nav className="breadcrumb" aria-label="Breadcrumb">{segments.map((segment, index) => <span className="breadcrumb-segment" key={`${segment.label}:${index}`}>{index > 0 && <span className="breadcrumb-separator">›</span>}{segment.icon && <span className="breadcrumb-icon" aria-hidden="true">{segment.icon}</span>}{segment.onClick ? <button onClick={segment.onClick}>{segment.label}</button> : <strong>{segment.label}</strong>}</span>)}{provenance && <span className="breadcrumb-provenance">{provenance}</span>}</nav>;
}

export function ContextTabs(props: { kind: "bot" | "package"; route: StudioRoute; setRoute: (route: StudioRoute) => void; overviewOnly?: boolean; packageKind?: PackageKind }) {
  const rows: Array<[StudioRoute, string]> = props.overviewOnly
    ? [[props.kind === "bot" ? "bot" : "package-overview", "Overview"]]
    : props.kind === "bot"
    ? [["bot","Overview"],["bot-packages","Packages"],["simulate","Simulate"],["bot-settings","Settings"],["build","Build"]]
    : [["package-overview","Overview"],...(props.packageKind === "fallback" ? [] as Array<[StudioRoute, string]> : [["teach","Teach"] as [StudioRoute, string]]),["author","Behaviors"],["capabilities","Capabilities"],["source","Source"],["assets","Assets"],["package-simulate","Simulate"],["audit","Audit"]];
  return <nav className="context-tabs" aria-label={`${props.kind} sections`}>{rows.map(([nextRoute,label]) => <button className={props.route === nextRoute ? "active" : ""} key={nextRoute} onClick={() => props.setRoute(nextRoute)}>{label}</button>)}</nav>;
}
