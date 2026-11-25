import { useState } from "react";
import { languageKey } from "./languages.js";
import { matcherProfileLanguages, matcherProfilesForLanguages } from "./matcher-profiles.js";
import {
  addBot, addProject, addProjectPackage, addSharedFallbackPackage, addSharedPackage,
  cloneStudioWorkspace, effectiveBotSettings, overrideContribution, overrideableContributions, botAttachablePackages, botPackageEligibility, UNRESOLVABLE_PACKAGE_GRAPH,
  projectPackageRemovalImpact, projectVisiblePackages, recordPackageMetadataEdit, removeBot, setBotFallbackPackage, setBotPackages,
  removeProject, removeProjectPackage, removeSharedPackage,
  botMissingMatcherLanguages, projectBotPackageClosureIds, projectAvailableLanguages, resolveSelectedBrain, selectedBot, selectedProject, sharedAvailableLanguages, touchStudioWorkspace,
} from "./studio-model.js";
import type { BotPackageEligibility } from "./studio-model.js";
import type { AuthorNumberDefinition, StudioBot, StudioConversationDefaults, StudioPackage, StudioProject, StudioRoute, StudioWorkspace } from "./types.js";
import { BOT_ICON, packageIcon } from "./studio-navigation.js";
import { humanize } from "./workspace.js";
import { EmptyState, Field, Metric, Modal, NumberSettings, useSubmitValidation, ValidationErrors } from "./studio-ui.js";

interface ProjectFormValue { id: string; title: string; description: string; matcher_languages: string[]; initial_bot_default_language: string; }
interface BotFormValue { id: string; title: string; description: string; default_language: string; enabled_languages: string[]; emit_debug_map: boolean; }
interface PackageFormValue { id: string; description: string; authoring_language: string; }

export function ProjectsView(props: { studio: StudioWorkspace; applyStudio: (fn: (current: StudioWorkspace) => StudioWorkspace, message?: string) => boolean; openProject: (id: string) => void }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editProject, setEditProject] = useState<StudioProject | null>(null);
  const [deleteProject, setDeleteProject] = useState<StudioProject | null>(null);
  return <div className="page-stack"><section className="page-heading"><div><h1>Projects</h1><p>Projects group Bots and portable Project Packages. Filesystem autosave keeps every Project folder self-contained.</p></div><button className="primary" onClick={() => setCreateOpen(true)}>New project</button></section>
    <section className="panel list-panel"><div className="data-list-header"><span>Project</span><span>Bots</span><span>Packages</span><span>Actions</span></div>{props.studio.projects.map((project) => <div className="data-row project-row" key={project.id}><div className="row-primary"><button className="row-title" onClick={() => props.openProject(project.id)}>{project.title || project.id}</button><span className="muted tiny">{project.description || project.id}</span></div><span>{project.bots.length}</span><span>{project.packages.length}</span><div className="row-actions"><IconAction label={`Edit ${project.title || project.id}`} icon="✎" onClick={() => setEditProject(project)} /><IconAction label={`Remove ${project.title || project.id}`} icon="🗑" danger onClick={() => setDeleteProject(project)} /></div></div>)}</section>
    {createOpen && <ProjectModal title="New project" languages={projectFormLanguages(props.studio)} validate={(value) => validateProjectForm(props.studio, null, value)} onClose={() => setCreateOpen(false)} onSave={(value) => { if (props.applyStudio((current) => createProjectFromForm(current, value), "Project created")) setCreateOpen(false); }} />}
    {editProject && <ProjectModal title="Edit project" languages={projectFormLanguages(props.studio, editProject)} initial={editProject} validate={(value) => validateProjectForm(props.studio, editProject.id, value)} onClose={() => setEditProject(null)} onSave={(value) => { if (props.applyStudio((current) => editProjectFromForm(current, editProject.id, value), "Project updated")) setEditProject(null); }} />}
    {deleteProject && <ConfirmModal title="Remove project?" message={`Remove “${deleteProject.title || deleteProject.id}” and all of its Bots and Project Packages?`} confirmLabel="Remove project" onClose={() => setDeleteProject(null)} onConfirm={() => { props.applyStudio((current) => removeProject(current, deleteProject.id), "Project removed"); setDeleteProject(null); }} />}
  </div>;
}

export function SharedPackagesView(props: { studio: StudioWorkspace; applyStudio: (fn: (current: StudioWorkspace) => StudioWorkspace, message?: string) => boolean; openPackage: (scope: "shared" | "project", id: string) => void }) {
  const [tab, setTab] = useState<"standard" | "fallback">("standard");
  const [createOpen, setCreateOpen] = useState(false);
  const [editPkg, setEditPkg] = useState<StudioPackage | null>(null);
  const [deletePkg, setDeletePkg] = useState<StudioPackage | null>(null);
  const packages = props.studio.shared_packages.filter((pkg) => pkg.manifest.kind === tab);
  const fallbackTab = tab === "fallback";
  return <div className="page-stack">
    <section className="page-heading"><div><h1>Shared Packages</h1><p>Standard Packages provide reusable matched behavior. Fallback Packages are a separate, non-overridable last-resort conversation layer.</p></div><button className="primary" onClick={() => setCreateOpen(true)}>{fallbackTab ? "New fallback package" : "New package"}</button></section>
    <div className="local-tabs"><button className={tab === "standard" ? "active" : ""} onClick={() => setTab("standard")}>Packages</button><button className={tab === "fallback" ? "active" : ""} onClick={() => setTab("fallback")}>Fallback Packages</button></div>
    {packages.length === 0 ? <EmptyState title={fallbackTab ? "No Fallback Packages" : "No Shared Packages"} text={fallbackTab ? "Create a Fallback Package for state-aware unresolved or repeated conversation responses." : "Create a reusable Shared Package."} /> : <section className="panel list-panel"><div className="data-list-header project-package-columns"><span>Package</span><span>Content</span><span>Used by</span><span>Actions</span></div>{packages.map((pkg) => {
      const usedCount = props.studio.projects.reduce((sum, project) => sum + [...projectBotPackageClosureIds(props.studio, project).values()].filter((ids) => ids?.includes(pkg.manifest.id)).length, 0);
      const content = fallbackTab ? `${pkg.contents.fallback_behaviors.length} fallback behaviors` : `${pkg.contents.behaviors.length} behaviors · ${pkg.contents.capabilities.length} capabilities`;
      return <div className="data-row project-package-columns" key={pkg.manifest.id}><div className="row-primary row-primary-icon"><span className="row-icon" aria-hidden="true">{packageIcon(pkg.manifest.kind)}</span><button className="row-title" onClick={() => props.openPackage("shared", pkg.manifest.id)}>{pkg.manifest.id}</button><span className="muted tiny">{pkg.manifest.description || (fallbackTab ? "Fallback Package" : "Reusable package")}</span></div><span>{content}</span><span>{usedCount ? `${usedCount} bot${usedCount === 1 ? "" : "s"}` : "—"}</span><div className="row-actions"><IconAction label={`Edit ${pkg.manifest.id}`} icon="✎" onClick={() => setEditPkg(pkg)} /><IconAction label={`Remove ${pkg.manifest.id}`} icon="🗑" danger onClick={() => setDeletePkg(pkg)} /></div></div>;
    })}</section>}
    {createOpen && <PackageModal title={fallbackTab ? "New fallback package" : "New shared package"} languages={sharedAvailableLanguages(props.studio)} validate={(value) => validatePackageForm(props.studio, "shared", null, value)} onClose={() => setCreateOpen(false)} onSave={(value) => { if (props.applyStudio((current) => createSharedPackageFromForm(current, value, fallbackTab ? "fallback" : "standard"), fallbackTab ? "Fallback Package created" : "Shared Package created")) setCreateOpen(false); }} />}
    {editPkg && <PackageModal title="Edit package" languages={sharedAvailableLanguages(props.studio)} initial={{ id: editPkg.manifest.id, description: editPkg.manifest.description, authoring_language: editPkg.authoring_language }} lockId validate={(value) => validatePackageForm(props.studio, "shared", editPkg.manifest.id, value)} onClose={() => setEditPkg(null)} onSave={(value) => { if (props.applyStudio((current) => recordPackageMetadataEdit(current, "shared", editPkg.manifest.id, value.description, value.authoring_language), "Package updated")) setEditPkg(null); }} />}
    {deletePkg && <ConfirmModal title="Remove package?" message={deletePkg.manifest.kind === "fallback" ? `Remove ${deletePkg.manifest.id}? Bots using it will return to no authored Fallback Package.` : `Remove ${deletePkg.manifest.id} from the shared library? Any Bot membership and dependent Project Packages are removed too.`} confirmLabel="Remove package" onClose={() => setDeletePkg(null)} onConfirm={() => { props.applyStudio((current) => removeSharedPackage(current, deletePkg.manifest.id), "Shared package removed"); setDeletePkg(null); }} />}
  </div>;
}

export function GlobalSettingsView(props: { studio: StudioWorkspace; applyStudio: (fn: (current: StudioWorkspace) => StudioWorkspace, message?: string) => boolean }) {
  const setConversationScalar=(key:ConversationScalarKey,value:number)=>props.applyStudio((current)=>{const next=cloneStudioWorkspace(current);next.settings.conversation[key]=value;return touchStudioWorkspace(next);});
  return <div className="page-stack"><section className="page-heading"><div><h1>Settings</h1><p>Studio-wide defaults. Bots inherit these values unless they explicitly override them.</p></div></section>
    <section className="panel"><div className="section-heading"><div><h2>Matching defaults</h2><p>Canonical defaults for new and existing Bots without an override.</p></div></div><NumberSettings value={props.studio.settings.semantic as unknown as Record<string,number>} onChange={(key,value) => props.applyStudio((current) => { const next=cloneStudioWorkspace(current); (next.settings.semantic as unknown as Record<string,number>)[key]=value; return touchStudioWorkspace(next); })} /></section>
    <section className="panel"><div className="section-heading"><div><h2>Conversation defaults</h2><p>Studio-wide continuity, repair, and repetition defaults. Bot memory is configured only on each Bot.</p></div></div><ConversationScalarSettings value={props.studio.settings.conversation} onChange={setConversationScalar} /></section>
  </div>;
}

export function ProjectView(props: { studio: StudioWorkspace; route: "project" | "project-packages"; onRoute: (route: StudioRoute) => void; applyStudio: (fn: (current: StudioWorkspace) => StudioWorkspace, message?: string) => boolean; openBot: (id: string) => void; openPackage: (scope: "shared" | "project", id: string) => void }) {
  const project = selectedProject(props.studio);
  const tab: "bots" | "packages" = props.route === "project-packages" ? "packages" : "bots";
  const [botModal, setBotModal] = useState<StudioBot|"new"|null>(null);
  const [deleteBot, setDeleteBot] = useState<StudioBot|null>(null);
  const [createPackageKind,setCreatePackageKind]=useState<"standard"|"fallback"|null>(null);
  const [editPkg,setEditPkg]=useState<StudioPackage|null>(null);
  const [deletePkg,setDeletePkg]=useState<StudioPackage|null>(null);
  const standardPackages = project.packages.filter((pkg) => pkg.manifest.kind === "standard");
  const fallbackPackages = project.packages.filter((pkg) => pkg.manifest.kind === "fallback");
  const projectLanguages = projectAvailableLanguages(project);
  const botClosures = projectBotPackageClosureIds(props.studio, project);
  return <div className="page-stack"><section className="page-heading"><div><h1>{project.title || project.id}</h1><p>{project.description || "Project"}</p></div></section><div className="local-tabs"><button className={tab==="bots"?"active":""} onClick={()=>props.onRoute("project")}>Bots</button><button className={tab==="packages"?"active":""} onClick={()=>props.onRoute("project-packages")}>Packages</button></div>
    {tab === "bots" ? <section className="panel list-panel"><div className="list-toolbar"><div><h2>Bots</h2><p className="muted small">Every Bot selects an enabled runtime-language subset and one always-enabled default from the Project catalog.</p></div><button className="primary" onClick={()=>setBotModal("new")}>New bot</button></div><div className="data-list-header bot-list-columns"><span>Bot</span><span>Packages</span><span>Default language</span><span>Actions</span></div>{project.bots.map((row)=><div className="data-row bot-list-columns" key={row.id}><div className="row-primary row-primary-icon"><span className="row-icon" aria-hidden="true">{BOT_ICON}</span><button className="row-title" onClick={()=>props.openBot(row.id)}>{row.title || row.id}</button><span className="muted tiny">{row.description || row.id}</span></div><span>{botClosures.get(row.id)?.length ?? "—"}</span><code>{row.default_language}</code><div className="row-actions"><IconAction label={`Edit ${row.title||row.id}`} icon="✎" onClick={()=>setBotModal(row)} /><IconAction label={`Remove ${row.title||row.id}`} icon="🗑" danger onClick={()=>setDeleteBot(row)} /></div></div>)}</section>
    : <>
      <ProjectPackageList kind="standard" title="Project Packages" description="Standard Packages owned only by this Project. Bots in this Project may add and override them." emptyTitle="No Project Packages" emptyText="Create a Standard Package when reusable content belongs only to this Project." packages={standardPackages} project={project} botClosures={botClosures} onCreate={()=>setCreatePackageKind("standard")} onEdit={setEditPkg} onDelete={setDeletePkg} openPackage={props.openPackage} />
      <ProjectPackageList kind="fallback" title="Project Fallback Packages" description="Fallback Packages owned only by this Project. A Bot may select one as a whole; it can never override it." emptyTitle="No Project Fallback Packages" emptyText="Create a Fallback Package when fallback conversation belongs only to this Project." packages={fallbackPackages} project={project} botClosures={botClosures} onCreate={()=>setCreatePackageKind("fallback")} onEdit={setEditPkg} onDelete={setDeletePkg} openPackage={props.openPackage} />
    </>}
    {botModal && <BotModal title={botModal==="new"?"New bot":"Edit bot"} languages={projectLanguages} initial={botModal==="new"?undefined:botModal} validate={(value)=>validateBotForm(props.studio,botModal==="new"?null:botModal.id,value)} onClose={()=>setBotModal(null)} onSave={(value)=>{ if (props.applyStudio((current)=>botModal==="new"?createBotFromForm(current,value):editBotFromForm(current,botModal.id,value),botModal==="new"?"Bot created":"Bot updated")) setBotModal(null); }} />}
    {deleteBot && <ConfirmModal title="Remove bot?" message={`Remove “${deleteBot.title||deleteBot.id}” and its private Bot Package? The Bot Package is deleted with the Bot.`} confirmLabel="Remove bot" onClose={()=>setDeleteBot(null)} onConfirm={()=>{props.applyStudio((current)=>removeBot(current,deleteBot.id),"Bot removed");setDeleteBot(null);}} />}
    {createPackageKind && <PackageModal title={createPackageKind==="fallback"?"New project fallback package":"New project package"} languages={projectLanguages} validate={(value)=>validatePackageForm(props.studio,"project",null,value)} onClose={()=>setCreatePackageKind(null)} onSave={(value)=>{ if (props.applyStudio((current)=>createProjectPackageFromForm(current,value,createPackageKind),createPackageKind==="fallback"?"Project Fallback Package created":"Project Package created")) setCreatePackageKind(null); }} />}
    {editPkg && <PackageModal title={editPkg.manifest.kind==="fallback"?"Edit project fallback package":"Edit project package"} languages={projectLanguages} initial={{id:editPkg.manifest.id,description:editPkg.manifest.description,authoring_language:editPkg.authoring_language}} lockId validate={(value)=>validatePackageForm(props.studio,"project",editPkg.manifest.id,value)} onClose={()=>setEditPkg(null)} onSave={(value)=>{ if (props.applyStudio((current)=>recordPackageMetadataEdit(current,"project",editPkg.manifest.id,value.description,value.authoring_language),"Project Package updated")) setEditPkg(null); }} />}
    {deletePkg && <ConfirmModal title={deletePkg.manifest.kind==="fallback"?"Remove Project Fallback Package?":"Remove Project Package?"} message={projectPackageDeleteMessage(props.studio, deletePkg.manifest.id)} confirmLabel="Remove package" onClose={()=>setDeletePkg(null)} onConfirm={()=>{props.applyStudio((current)=>removeProjectPackage(current,deletePkg.manifest.id),deletePkg.manifest.kind==="fallback"?"Project Fallback Package removed":"Project Package removed");setDeletePkg(null);}} />}
  </div>;
}

function ProjectPackageList(props:{kind:"standard"|"fallback";title:string;description:string;emptyTitle:string;emptyText:string;packages:StudioPackage[];project:StudioProject;botClosures:Map<string,string[]|null>;onCreate:()=>void;onEdit:(pkg:StudioPackage)=>void;onDelete:(pkg:StudioPackage)=>void;openPackage:(scope:"shared"|"project",id:string)=>void}) {
  const fallback = props.kind === "fallback";
  return <section className="panel list-panel"><div className="list-toolbar"><div><h2>{props.title}</h2><p className="muted small">{props.description}</p></div><button className="primary" onClick={props.onCreate}>{fallback ? "New project fallback package" : "New project package"}</button></div>{props.packages.length===0?<EmptyState title={props.emptyTitle} text={props.emptyText}/>:<><div className="data-list-header project-package-columns"><span>Package</span><span>Content</span><span>Used by Bots</span><span>Actions</span></div>{props.packages.map((pkg)=>{const used=[...props.botClosures.values()].filter((ids)=>ids?.includes(pkg.manifest.id)).length;const content=fallback?`${pkg.contents.fallback_behaviors.length} fallback behaviors`:`${pkg.contents.behaviors.length} behaviors · ${pkg.contents.capabilities.length} capabilities`;return <div className="data-row project-package-columns" key={pkg.manifest.id}><div className="row-primary row-primary-icon"><span className="row-icon" aria-hidden="true">{packageIcon(pkg.manifest.kind)}</span><button className="row-title" onClick={()=>props.openPackage("project",pkg.manifest.id)}>{pkg.manifest.id}</button><span className="muted tiny">{pkg.manifest.description || (fallback?"Project Fallback Package":"Project Package")}</span></div><span>{content}</span><span>{used}</span><div className="row-actions"><IconAction label={`Edit ${pkg.manifest.id}`} icon="✎" onClick={()=>props.onEdit(pkg)} /><IconAction label={`Remove ${pkg.manifest.id}`} icon="🗑" danger onClick={()=>props.onDelete(pkg)} /></div></div>;})}</>}</section>;
}

export function BotOverviewView(props: { studio: StudioWorkspace; applyStudio: (fn: (current: StudioWorkspace) => StudioWorkspace, message?: string) => boolean; onOpenPackages: () => void; onTeach: () => void; onSimulate: () => void; onDownloadArchive: () => void }) {
  const project = selectedProject(props.studio); const bot = selectedBot(props.studio, project); const brain = resolveSelectedBrain(props.studio);
  const missingMatchers = botMissingMatcherLanguages(props.studio, project, bot);
  const disabled = missingMatchers.length > 0;
  const [editing, setEditing] = useState(false);
  const behaviorCount = brain.packages.reduce((sum, pkg) => sum + pkg.contents.behaviors.length, 0);
  const capabilityCount = brain.packages.reduce((sum, pkg) => sum + pkg.contents.capabilities.length, 0);
  const testCount = brain.packages.reduce((sum, pkg) => sum + pkg.contents.regression_cases.length + pkg.contents.scenarios.length, 0);
  return <div className="page-stack">
    <section className="page-heading"><div className="heading-identity"><span className="heading-icon" aria-hidden="true">{BOT_ICON}</span><div><h1>{bot.title || bot.id}</h1><p>{bot.description || "Bot"}</p></div>{disabled && <span className="chip">Disabled</span>}</div><div className="inline-actions"><button className="archive-download" onClick={props.onDownloadArchive}>Download bot ZIP</button><button onClick={() => setEditing(true)}>Edit bot</button></div></section>
    {disabled && <section className="panel"><div className="error-banner"><strong>Bot disabled.</strong> Missing Language/Matcher Profile pair{missingMatchers.length === 1 ? "" : "s"} for: {missingMatchers.join(", ")}. Restore both Project profile JSON files for those languages or edit the Bot to stop using the missing languages.</div></section>}
    <section className="panel"><div className="section-heading"><div><h2>Overview</h2><p>Identity and resolved composition for this Bot. Package authoring lives in the Packages tab.</p></div></div>
      <div className="metric-grid"><Metric label="Packages" value={brain.packages.length} /><Metric label="Behaviors" value={behaviorCount} /><Metric label="Capabilities" value={capabilityCount} /><Metric label="Tests" value={testCount} /></div>
      <div className="overview-facts"><div><span>Bot ID</span><code>{bot.id}</code></div><div><span>Project</span><strong>{project.title || project.id}</strong></div><div><span>Enabled languages</span><code>{bot.enabled_languages.join(", ")}</code></div><div><span>Default language</span><code>{bot.default_language}</code></div><div><span>Bot Package</span><code>{bot.package.manifest.id}</code></div><div><span>Added Packages</span><strong>{bot.package_ids.length}</strong></div><div><span>Fallback Package</span>{bot.fallback_package_id ? <code>{bot.fallback_package_id}</code> : <strong>None</strong>}</div><div><span>Debug source map</span><strong>{effectiveBotSettings(props.studio, bot).emit_debug_map ? "Included" : "Excluded"}</strong></div></div>
    </section>
    {!disabled && <section className="panel"><div className="section-heading"><div><h2>Work on this Bot</h2><p>Teach this Bot by chatting, manage its Packages, or test the resolved Bot.</p></div><div className="inline-actions"><button className="primary" onClick={props.onTeach}>Teach by chatting</button><button onClick={props.onOpenPackages}>Packages</button><button onClick={props.onSimulate}>Simulate</button></div></div></section>}
    {editing && <BotModal title="Edit bot" languages={projectAvailableLanguages(project)} initial={bot} validate={(value)=>validateBotForm(props.studio,bot.id,value)} onClose={() => setEditing(false)} onSave={(value) => { if (props.applyStudio((current) => editBotFromForm(current, bot.id, value), "Bot updated")) setEditing(false); }} />}
  </div>;
}

export function BotPackagesView(props: { studio: StudioWorkspace; applyStudio: (fn: (current: StudioWorkspace) => StudioWorkspace, message?: string) => boolean; openPackage: (scope: "shared" | "project" | "bot", id: string) => void }) {
  const project = selectedProject(props.studio); const bot = selectedBot(props.studio, project); const available = botAttachablePackages(props.studio, project);
  const fallbacks = botPackageEligibility(props.studio, project, bot, "fallback");
  const [managerOpen, setManagerOpen] = useState(false); const [overrideBase, setOverrideBase] = useState<string | null>(null);
  const byId = new Map(available.map((pkg)=>[pkg.manifest.id,pkg]));
  const projectPackageIds = new Set(project.packages.map((pkg)=>pkg.manifest.id));
  const sharedFallbackIds = new Set(props.studio.shared_packages.filter((pkg) => pkg.manifest.kind === "fallback").map((pkg)=>pkg.manifest.id));
  const projectFallbackIds = new Set(project.packages.filter((pkg)=>pkg.manifest.kind === "fallback").map((pkg)=>pkg.manifest.id));
  const sharedFallbacks = fallbacks.filter((row)=>sharedFallbackIds.has(row.package.manifest.id));
  const projectFallbacks = fallbacks.filter((row)=>projectFallbackIds.has(row.package.manifest.id));
  const ownerScope = (id:string): "shared" | "project" => projectPackageIds.has(id) ? "project" : "shared";
  return <div className="page-stack">
    <section className="page-heading"><div><h1>Packages</h1><p>{bot.title || bot.id} owns one Bot Package and may reference Shared or Project-owned Packages. Build snapshots the resolved sources into the compiled Brain.</p></div><button className="primary" onClick={() => setManagerOpen(true)}>Manage Packages</button></section>
    <section className="panel list-panel"><div className="list-toolbar"><div><h2>Bot Package</h2><p className="muted small">Created with this Bot, owned only by this Bot, never shareable or detachable, and deleted only when the Bot is deleted. Bot-specific content and overrides live here.</p></div></div><div className="data-list-header bot-override-columns"><span>Package</span><span>Content</span><span>Actions</span></div><div className="data-row bot-override-columns"><div className="row-primary row-primary-icon"><span className="row-icon" aria-hidden="true">{packageIcon(bot.package.manifest.kind)}</span><button className="row-title" onClick={()=>props.openPackage("bot",bot.package.manifest.id)}>{bot.package.manifest.id}</button><span className="muted tiny">{bot.package.manifest.description || "Bot-owned Package"}</span></div><span>{bot.package.contents.behaviors.length} behaviors · {bot.package.contents.capabilities.length} capabilities</span><div className="row-actions"><button className="compact" onClick={()=>props.openPackage("bot",bot.package.manifest.id)}>Open</button></div></div></section>
    <section className="panel list-panel"><div className="list-toolbar"><div><h2>Added Packages</h2><p className="muted small">Selected Shared or Project-owned Standard Packages. Any Bot-specific replacement is stored only in the Bot Package.</p></div></div>{bot.package_ids.length===0?<EmptyState title="No added Packages" text="Use Manage Packages to select Shared or Project Packages."/>:<><div className="data-list-header bot-package-columns"><span>Package</span><span>Source</span><span>Override</span><span>Actions</span></div>{bot.package_ids.map((id)=>{const pkg=byId.get(id);if(!pkg)return null;const scope=ownerScope(id);return <div className="data-row bot-package-columns" key={id}><div className="row-primary row-primary-icon"><span className="row-icon" aria-hidden="true">{packageIcon(pkg.manifest.kind)}</span><button className="row-title" onClick={()=>props.openPackage(scope,id)}>{id}</button><span className="muted tiny">{pkg.manifest.description || "Package"}</span></div><span>{scope === "shared" ? "Shared" : "Project"}</span><button className="compact" onClick={()=>setOverrideBase(id)}>Override</button><div className="row-actions"><button className="compact" onClick={()=>props.openPackage(scope,id)}>Open</button></div></div>;})}</>}</section>
    <section className="panel"><div className="section-heading"><div><h2>Fallback Package</h2><p>Optional. Select one whole, non-overridable Shared or Project-owned Fallback Package. Shared source remains in Shared scope.</p></div></div><div className="form-grid two"><Field label="Selected Fallback Package"><select value={bot.fallback_package_id ?? ""} onChange={(e) => props.applyStudio((current) => setBotFallbackPackage(current, e.target.value || null), "Fallback Package updated")}><option value="">None</option>{sharedFallbacks.length?<optgroup label="Shared Fallback Packages">{sharedFallbacks.map((row)=><option key={row.package.manifest.id} value={row.package.manifest.id} disabled={!row.eligible}>{row.package.manifest.id}{row.eligible?"":` · ${optionBlockedSuffix(row)}`}</option>)}</optgroup>:null}{projectFallbacks.length?<optgroup label="Project Fallback Packages">{projectFallbacks.map((row)=><option key={row.package.manifest.id} value={row.package.manifest.id} disabled={!row.eligible}>{row.package.manifest.id}{row.eligible?"":` · ${optionBlockedSuffix(row)}`}</option>)}</optgroup>:null}</select></Field>{bot.fallback_package_id ? <div className="field-actions"><button onClick={() => props.openPackage(ownerScope(bot.fallback_package_id!), bot.fallback_package_id!)}>Open Fallback Package</button></div> : null}</div></section>
    {managerOpen && <BotPackageManagerModal studio={props.studio} project={project} bot={bot} onClose={()=>setManagerOpen(false)} onSave={(ids)=>{if(props.applyStudio((current)=>setBotPackages(current,ids),"Bot Packages updated"))setManagerOpen(false);}} />}
    {overrideBase && <OverrideContentModal studio={props.studio} baseId={overrideBase} onClose={()=>setOverrideBase(null)} applyStudio={props.applyStudio} />}
  </div>;
}

export function BotSettingsView(props: { studio: StudioWorkspace; applyStudio: (fn: (current: StudioWorkspace) => StudioWorkspace, message?: string) => boolean }) {
  const project=selectedProject(props.studio); const bot=selectedBot(props.studio,project); const effective=effectiveBotSettings(props.studio,bot);
  const setBot=(fn:(bot:StudioBot)=>void)=>props.applyStudio((current)=>{const next=cloneStudioWorkspace(current);fn(selectedBot(next,selectedProject(next)));return touchStudioWorkspace(next);});
  const setNumber=(group:"semantic"|"conversation", key:string, value:number)=>setBot((b)=>{
    const defaults=props.studio.settings[group] as unknown as Record<string,number>;
    const values=b.settings[group] as unknown as Record<string,number>;
    if (Object.is(value,defaults[key])) delete values[key]; else values[key]=value;
  });
  const setAuthorNumbers=(rows:AuthorNumberDefinition[])=>setBot((b)=>{b.settings.conversation.author_numbers=rows;});
  return <div className="page-stack">
    <section className="panel"><div className="section-heading"><div><h2>Bot settings</h2><p>This Bot enables {bot.enabled_languages.join(", ")} at runtime and uses {bot.default_language} whenever no enabled explicit request or active-session language is available.</p></div></div></section>
    <section className="panel"><div className="section-heading"><div><h2>Matching settings</h2></div></div><NumberSettings value={effective.semantic as unknown as Record<string,number>} onChange={(key,value)=>setNumber("semantic",key,value)}/></section>
    <section className="panel"><div className="section-heading"><div><h2>Conversation settings</h2><p>Values equal to Studio defaults are stored by inheritance rather than duplicated on the Bot.</p></div></div><ConversationScalarSettings value={effective.conversation} onChange={(key,value)=>setNumber("conversation",key,value)} /></section>
    <NumericBotMemoryCard value={bot.settings.conversation.author_numbers} onChange={setAuthorNumbers} />
  </div>;
}

type ConversationScalarKey = keyof StudioConversationDefaults;
const CONVERSATION_SCALAR_KEYS: ConversationScalarKey[] = ["default_topic_ttl","default_followup_ttl","recent_response_limit","recent_variant_limit","recent_user_window","repeat_detection_window","repeat_detection_threshold","max_messages_per_turn","repair_candidate_min_score","topic_preference_margin"];
function ConversationScalarSettings(props:{value:StudioConversationDefaults;onChange:(key:ConversationScalarKey,value:number)=>void}) {
  const scalar=Object.fromEntries(CONVERSATION_SCALAR_KEYS.map((key)=>[key,props.value[key]])) as Record<string,number>;
  return <NumberSettings value={scalar} onChange={(key,value)=>props.onChange(key as ConversationScalarKey,value)} />;
}

function NumericBotMemoryCard(props:{value:AuthorNumberDefinition[];onChange:(rows:AuthorNumberDefinition[])=>void}) {
  const updateNumber=(index:number,key:keyof AuthorNumberDefinition,value:string)=>{const rows=structuredClone(props.value);const row=rows[index]!;if(key==="path")row.path=value;else row[key]=Number(value);props.onChange(rows);};
  const remove=(index:number)=>props.onChange(props.value.filter((_row,i)=>i!==index));
  const add=()=>props.onChange([...props.value,{path:"happiness",default:50,min:0,max:100}]);
  return <section className="panel"><div className="section-heading"><div><h2>Numeric Bot memory</h2><p>Optional numbers this Bot remembers during a conversation, such as happiness, trust, or progress. Each starts at Default; response effects may assign or increment it, and the value always stays between Min and Max. Memory paths must be unique and cannot overlap.</p></div><button onClick={add}>Add memory number</button></div>{props.value.length===0?<p className="muted small">This Bot has no numeric memory.</p>:<div className="item-stack">{props.value.map((row,index)=><div className="author-number-row" key={`${row.path}-${index}`}><Field label="Memory path"><input value={row.path} onChange={(e)=>updateNumber(index,"path",e.target.value)} placeholder="happiness" /></Field><Field label="Default"><input type="number" step="any" value={row.default} onChange={(e)=>updateNumber(index,"default",e.target.value)} /></Field><Field label="Min"><input type="number" step="any" value={row.min} onChange={(e)=>updateNumber(index,"min",e.target.value)} /></Field><Field label="Max"><input type="number" step="any" value={row.max} onChange={(e)=>updateNumber(index,"max",e.target.value)} /></Field><button className="icon-button danger" aria-label={`Remove memory number ${row.path}`} onClick={()=>remove(index)}>×</button></div>)}</div>}</section>;
}

function ProjectModal(props:{title:string;languages:string[];initial?:StudioProject;validate:(value:ProjectFormValue)=>string[];onClose:()=>void;onSave:(value:ProjectFormValue)=>void}) {
  const [id,setId]=useState(props.initial?.id??"");
  const [title,setTitle]=useState(props.initial?.title??"");
  const [description,setDescription]=useState(props.initial?.description??"");
  const [selected,setSelected]=useState(()=>new Set((props.initial ? matcherProfileLanguages(props.initial.matcher_profiles) : props.languages).map(languageKey)));
  const [initialBotDefaultLanguage,setInitialBotDefaultLanguage]=useState(props.initial?"":props.languages[0]??"");
  const toggle=(language:string,checked:boolean)=>setSelected((current)=>{const next=new Set(current);if(checked)next.add(languageKey(language));else next.delete(languageKey(language));return next;});
  const selectedLanguages=props.languages.filter((language)=>selected.has(languageKey(language)));
  const value:ProjectFormValue={id:id.trim(),title:title.trim(),description:description.trim(),matcher_languages:selectedLanguages,initial_bot_default_language:initialBotDefaultLanguage};
  const errors=props.validate(value);
  const {attempted,guardSave}=useSubmitValidation(errors);
  return <Modal title={props.title} onClose={props.onClose}>
    <ValidationErrors errors={errors} show={attempted}/>
    <div className="form-grid">
      <Field label="Project ID"><input autoFocus value={id} onChange={(e)=>setId(e.target.value)} placeholder="my-project"/></Field>
      <Field label="Name"><input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="My Project"/></Field>
      <Field label="Description"><textarea rows={3} value={description} onChange={(e)=>setDescription(e.target.value)}/></Field>
      <Field label="Languages"><div className="item-stack">{props.languages.map((language)=><label className="check-row" key={language}><input type="checkbox" checked={selected.has(languageKey(language))} onChange={(event)=>toggle(language,event.target.checked)}/><span>{language}</span></label>)}</div></Field>
      {!props.initial&&<Field label="Initial Bot default language"><select value={initialBotDefaultLanguage} onChange={(event)=>setInitialBotDefaultLanguage(event.target.value)}>{selectedLanguages.map((language)=><option key={language} value={language}>{language}</option>)}</select></Field>}
    </div>
    <div className="modal-actions"><button onClick={props.onClose}>Cancel</button><button className="primary" onClick={guardSave(()=>props.onSave(value))}>Save</button></div>
  </Modal>;
}
function BotModal(props:{title:string;languages:string[];initial?:StudioBot | undefined;validate:(value:BotFormValue)=>string[];onClose:()=>void;onSave:(value:BotFormValue)=>void}) {
  const [id,setId]=useState(props.initial?.id??"");
  const [title,setTitle]=useState(props.initial?.title??"");
  const [description,setDescription]=useState(props.initial?.description??"");
  const [defaultLanguage,setDefaultLanguage]=useState(props.initial?.default_language??props.languages[0]??"");
  // A new Bot starts with the whole Project language catalog so Project Packages stay eligible.
  const [enabled,setEnabled]=useState(()=>new Set((props.initial?.enabled_languages??props.languages).map(languageKey)));
  const [emitDebugMap,setEmitDebugMap]=useState(props.initial?.settings.emit_debug_map??false);
  const selectDefault=(language:string)=>{setDefaultLanguage(language);setEnabled((current)=>new Set([...current,languageKey(language)]));};
  const toggle=(language:string,checked:boolean)=>setEnabled((current)=>{const next=new Set(current);if(checked)next.add(languageKey(language));else next.delete(languageKey(language));return next;});
  const enabledLanguages=props.languages.filter((language)=>enabled.has(languageKey(language)));
  const value:BotFormValue={id:id.trim(),title:title.trim(),description:description.trim(),default_language:defaultLanguage,enabled_languages:enabledLanguages,emit_debug_map:emitDebugMap};
  const errors=props.validate(value);
  const {attempted,guardSave}=useSubmitValidation(errors);
  return <Modal title={props.title} onClose={props.onClose}><ValidationErrors errors={errors} show={attempted}/><div className="form-grid"><Field label="Bot ID"><input autoFocus value={id} onChange={(e)=>setId(e.target.value)} placeholder="support-bot"/></Field><Field label="Name"><input value={title} onChange={(e)=>setTitle(e.target.value)}/></Field><Field label="Description"><textarea rows={3} value={description} onChange={(e)=>setDescription(e.target.value)}/></Field><Field label="Default language"><select value={defaultLanguage} onChange={(event)=>selectDefault(event.target.value)}>{props.languages.map((language)=><option key={language} value={language}>{language}</option>)}</select></Field><Field label="Enabled languages"><div className="item-stack">{props.languages.map((language)=>{const isDefault=languageKey(language)===languageKey(defaultLanguage);return <label className="check-row" key={language}><input type="checkbox" checked={enabled.has(languageKey(language))} disabled={isDefault} onChange={(event)=>toggle(language,event.target.checked)}/><span>{language}{isDefault?" · default":""}</span></label>;})}</div></Field><Field label="Build output"><div className="item-stack"><label className="check-row"><input type="checkbox" checked={emitDebugMap} onChange={(event)=>setEmitDebugMap(event.target.checked)}/><span>Include the debug source map in built artifacts</span></label></div><span className="muted tiny">The debug map describes composition provenance and authored test IDs for tooling. It never changes runtime behavior, and leaving it off produces the smaller production artifact.</span></Field></div><div className="modal-actions"><button onClick={props.onClose}>Cancel</button><button className="primary" onClick={guardSave(()=>props.onSave(value))}>Save</button></div></Modal>;
}
function PackageModal(props:{title:string;languages:string[];initial?:PackageFormValue | undefined;lockId?:boolean;validate:(value:PackageFormValue)=>string[];onClose:()=>void;onSave:(value:PackageFormValue)=>void}) {
  const [id,setId]=useState(props.initial?.id??"");
  const [description,setDescription]=useState(props.initial?.description??"");
  const [authoringLanguage,setAuthoringLanguage]=useState(props.initial?.authoring_language??props.languages[0]??"");
  const value:PackageFormValue={id:id.trim(),description:description.trim(),authoring_language:authoringLanguage};
  const errors=props.validate(value);
  const {attempted,guardSave}=useSubmitValidation(errors);
  return <Modal title={props.title} onClose={props.onClose}><ValidationErrors errors={errors} show={attempted}/><div className="form-grid"><Field label="Package ID"><input autoFocus={!props.lockId} disabled={props.lockId} value={id} onChange={(e)=>setId(e.target.value)} placeholder="conversation.formal-greetings"/></Field><Field label="Description"><textarea autoFocus={props.lockId} rows={3} value={description} onChange={(e)=>setDescription(e.target.value)}/></Field><Field label="Authoring language"><select value={authoringLanguage} onChange={(event)=>setAuthoringLanguage(event.target.value)}>{props.languages.map((language)=><option key={language} value={language}>{language}</option>)}</select></Field></div><div className="modal-actions"><button onClick={props.onClose}>Cancel</button><button className="primary" onClick={guardSave(()=>props.onSave(value))}>Save</button></div></Modal>;
}
function optionBlockedSuffix(row: BotPackageEligibility): string {
  return row.missing_languages.includes(UNRESOLVABLE_PACKAGE_GRAPH) ? "unavailable dependency" : `needs ${row.missing_languages.join(", ")}`;
}

/** Why one Package cannot join this Bot, in the author's own next action. */
function ineligibilityReason(row: BotPackageEligibility): string {
  if (row.missing_languages.includes(UNRESOLVABLE_PACKAGE_GRAPH)) return "This Package requires a Package that is missing or forms a dependency cycle.";
  return `Enable ${row.missing_languages.join(", ")} for this Bot to use this Package.`;
}

function BotPackageManagerModal(props:{studio:StudioWorkspace;project:StudioProject;bot:StudioBot;onClose:()=>void;onSave:(ids:string[])=>void}) {
  const available = botPackageEligibility(props.studio, props.project, props.bot, "standard");
  const projectIds = new Set(props.project.packages.map((pkg)=>pkg.manifest.id));
  const shared = available.filter((row)=>!projectIds.has(row.package.manifest.id));
  const projectPackages = available.filter((row)=>projectIds.has(row.package.manifest.id));
  const [selected,setSelected]=useState(()=>new Set(props.bot.package_ids));
  const toggle=(id:string,checked:boolean)=>setSelected((current)=>{const next=new Set(current);if(checked)next.add(id);else next.delete(id);return next;});
  const rows=(packages:BotPackageEligibility[])=>packages.map((row)=><label className={`package-choice-row${row.eligible?"":" disabled-row"}`} key={row.package.manifest.id}><input type="checkbox" checked={selected.has(row.package.manifest.id)} disabled={!row.eligible} onChange={(e)=>toggle(row.package.manifest.id,e.target.checked)}/><span className="grow"><strong>{row.package.manifest.id}</strong><span className="muted tiny">{row.eligible?(row.package.manifest.description || "Package"):ineligibilityReason(row)}</span></span></label>);
  return <Modal title="Manage Packages" size="workspace" onClose={props.onClose}><div className="editor-layout">
    <div className="editor-scroll">
      <p className="muted small">Select Shared or Project-owned Standard Packages. Shared Packages remain live references and are copied only into the transient compile source.</p>
      <div className="package-manager-groups">
        <section><h3>Shared Packages</h3>{shared.length?rows(shared):<p className="muted small">No Shared Packages available.</p>}</section>
        <section><h3>Project Packages</h3>{projectPackages.length?rows(projectPackages):<p className="muted small">No Project Packages available.</p>}</section>
      </div>
      <p className="muted tiny">Unchecking a Package also removes this Bot's replacements targeting that Package.</p>
    </div>
    <div className="sticky-editor-footer"><span className="footer-spacer" aria-hidden="true" /><button onClick={props.onClose}>Cancel</button><button className="primary" onClick={()=>props.onSave(available.filter((row)=>row.eligible&&selected.has(row.package.manifest.id)).map((row)=>row.package.manifest.id))}>Save changes</button></div>
  </div></Modal>;
}

function ConfirmModal(props:{title:string;message:string;confirmLabel:string;onClose:()=>void;onConfirm:()=>void}) { return <Modal title={props.title} onClose={props.onClose}><p>{props.message}</p><div className="modal-actions"><button onClick={props.onClose}>Cancel</button><button className="danger" onClick={props.onConfirm}>{props.confirmLabel}</button></div></Modal>; }
function IconAction(props:{label:string;icon:string;onClick:()=>void;danger?:boolean;disabled?:boolean}) { return <button className={`icon-button ${props.danger?"danger":""}`} aria-label={props.label} title={props.label} disabled={props.disabled} onClick={props.onClick}>{props.icon}</button>; }

function validateProjectForm(studio:StudioWorkspace,oldId:string|null,value:ProjectFormValue):string[] { const errors:string[]=[]; if(!validStudioId(value.id))errors.push("Project ID must start with a letter or number and use only letters, numbers, dot, underscore, or hyphen."); if(studio.projects.some((row)=>row.id===value.id&&row.id!==oldId))errors.push(`Project ${value.id} already exists.`); if(value.matcher_languages.length===0)errors.push("Select at least one Project Matcher Profile.");const selected=new Set(value.matcher_languages.map(languageKey));if(!oldId&&!selected.has(languageKey(value.initial_bot_default_language)))errors.push("Select the initial Bot default language from this Project.");return errors; }
function validateBotForm(studio:StudioWorkspace,oldId:string|null,value:BotFormValue):string[] { const errors:string[]=[]; if(!validStudioId(value.id))errors.push("Bot ID must start with a letter or number and use only letters, numbers, dot, underscore, or hyphen."); const project=selectedProject(studio); if(project.bots.some((row)=>row.id===value.id&&row.id!==oldId))errors.push(`Bot ${value.id} already exists in this Project.`);const languages=projectAvailableLanguages(project);const allowed=new Set(languages.map(languageKey));const enabled=new Set(value.enabled_languages.map(languageKey));if(value.enabled_languages.length===0)errors.push("Enable at least one Bot language.");if(value.enabled_languages.some((language)=>!allowed.has(languageKey(language))))errors.push("Enabled languages must have Project Matcher Profiles.");if(!enabled.has(languageKey(value.default_language)))errors.push("The Bot default language must remain enabled.");return errors; }
function allOwnedPackageIds(studio:StudioWorkspace):Set<string> { const ids=new Set(studio.shared_packages.map((pkg)=>pkg.manifest.id)); for(const project of studio.projects){for(const pkg of project.packages)ids.add(pkg.manifest.id);for(const bot of project.bots)ids.add(bot.package.manifest.id);} return ids; }
function validatePackageForm(studio:StudioWorkspace,scope:"shared"|"project",oldId:string|null,value:PackageFormValue):string[] { const errors:string[]=[]; if(!validStudioId(value.id))errors.push("Package ID must start with a letter or number and use only letters, numbers, dot, underscore, or hyphen."); if(value.id!==oldId&&allOwnedPackageIds(studio).has(value.id))errors.push(`Package ID ${value.id} already exists.`);const languages=scope==="shared"?sharedAvailableLanguages(studio):projectAvailableLanguages(selectedProject(studio));if(!languages.some((language)=>languageKey(language)===languageKey(value.authoring_language)))errors.push("Select an authoring language backed by an owning-scope Matcher Profile.");return errors; }
export function selectProjectWorkspace(current:StudioWorkspace,projectId:string):StudioWorkspace { const next=cloneStudioWorkspace(current);const project=next.projects.find((row)=>row.id===projectId);if(!project)throw new Error(`Project ${projectId} does not exist.`);next.selectedProjectId=project.id;next.selectedBotId=project.bots[0]?.id??"";const projectPkg=project.packages[0];if(projectPkg){next.selectedPackageScope="project";next.selectedPackageId=projectPkg.manifest.id;}else if(project.bots[0]){next.selectedPackageScope="bot";next.selectedPackageId=project.bots[0].package.manifest.id;}else next.selectedPackageId="";return touchStudioWorkspace(next); }
export function selectBotWorkspace(current:StudioWorkspace,botId:string):StudioWorkspace { const next=cloneStudioWorkspace(current);const project=selectedProject(next);const bot=project.bots.find((row)=>row.id===botId);if(!bot)throw new Error(`Bot ${botId} does not exist.`);next.selectedBotId=bot.id;next.selectedPackageScope="bot";next.selectedPackageId=bot.package.manifest.id;return touchStudioWorkspace(next); }
export function selectPackageWorkspace(current:StudioWorkspace,scope:"shared"|"project"|"bot",id:string):StudioWorkspace { const next=cloneStudioWorkspace(current);let exists=false;if(scope==="shared")exists=next.shared_packages.some((pkg)=>pkg.manifest.id===id);else if(scope==="project"){const project=selectedProject(next);exists=project.packages.some((pkg)=>pkg.manifest.id===id);}else exists=selectedBot(next,selectedProject(next)).package.manifest.id===id;if(!exists)throw new Error(`Package ${id} does not exist in ${scope} scope.`);next.selectedPackageScope=scope;next.selectedPackageId=id;return touchStudioWorkspace(next); }
function createProjectFromForm(current:StudioWorkspace,value:ProjectFormValue):StudioWorkspace { if(current.projects.some((row)=>row.id===value.id))throw new Error(`Project ${value.id} already exists.`);let next=addProject(current,value.id,value.matcher_languages,value.initial_bot_default_language);next=cloneStudioWorkspace(next);const project=selectedProject(next);project.id=value.id;project.title=value.title||humanize(value.id);project.description=value.description;next.selectedProjectId=project.id;return touchStudioWorkspace(next); }
function editProjectFromForm(current:StudioWorkspace,oldId:string,value:ProjectFormValue):StudioWorkspace { const next=cloneStudioWorkspace(current);if(value.id!==oldId&&next.projects.some((row)=>row.id===value.id))throw new Error(`Project ${value.id} already exists.`);const project=next.projects.find((row)=>row.id===oldId);if(!project)throw new Error(`Project ${oldId} does not exist.`);project.id=value.id;project.title=value.title||humanize(value.id);project.description=value.description;project.matcher_profiles=matcherProfilesForLanguages(value.matcher_languages,project.matcher_profiles,next.shared_matcher_profiles);if(next.selectedProjectId===oldId)next.selectedProjectId=value.id;return touchStudioWorkspace(next); }
function createBotFromForm(current:StudioWorkspace,value:BotFormValue):StudioWorkspace { const project=selectedProject(current);if(project.bots.some((row)=>row.id===value.id))throw new Error(`Bot ${value.id} already exists.`);let next=addBot(current,value.id,value.default_language,value.enabled_languages);next=cloneStudioWorkspace(next);const bot=selectedBot(next);bot.id=value.id;bot.title=value.title||humanize(value.id);bot.description=value.description;bot.default_language=value.default_language;bot.enabled_languages=[...value.enabled_languages];bot.package.authoring_language=value.default_language;bot.settings.emit_debug_map=value.emit_debug_map;next.selectedBotId=bot.id;return touchStudioWorkspace(next); }
function editBotFromForm(current:StudioWorkspace,oldId:string,value:BotFormValue):StudioWorkspace { const next=cloneStudioWorkspace(current);const project=selectedProject(next);if(value.id!==oldId&&project.bots.some((row)=>row.id===value.id))throw new Error(`Bot ${value.id} already exists.`);const projectLanguages=projectAvailableLanguages(project);const allowed=new Set(projectLanguages.map(languageKey));const enabledKeys=new Set(value.enabled_languages.map(languageKey));if(value.enabled_languages.length===0||value.enabled_languages.some((language)=>!allowed.has(languageKey(language)))||!enabledKeys.has(languageKey(value.default_language)))throw new Error("Bot enabled languages must be a non-empty Matcher-Profile-backed Project subset containing its default language.");const bot=project.bots.find((row)=>row.id===oldId);if(!bot)throw new Error(`Bot ${oldId} does not exist.`);bot.id=value.id;bot.title=value.title||humanize(value.id);bot.description=value.description;bot.default_language=value.default_language;bot.enabled_languages=projectLanguages.filter((language)=>enabledKeys.has(languageKey(language)));bot.package.authoring_language=value.default_language;bot.settings.emit_debug_map=value.emit_debug_map;if(next.selectedBotId===oldId)next.selectedBotId=value.id;return touchStudioWorkspace(next); }
function createSharedPackageFromForm(current:StudioWorkspace,value:PackageFormValue,kind:"standard"|"fallback"="standard"):StudioWorkspace { let next=kind==="fallback"?addSharedFallbackPackage(current,value.id,value.authoring_language):addSharedPackage(current,value.id,value.authoring_language);next=cloneStudioWorkspace(next);const pkg=next.shared_packages.find((row)=>row.manifest.id===value.id);if(!pkg)throw new Error("New shared package was not created.");pkg.manifest.description=value.description;return touchStudioWorkspace(next); }
function createProjectPackageFromForm(current:StudioWorkspace,value:PackageFormValue,kind:"standard"|"fallback"):StudioWorkspace { const project=selectedProject(current);if(current.shared_packages.some((row)=>row.manifest.id===value.id)||projectVisiblePackages(current,project).some((row)=>row.manifest.id===value.id)||project.bots.some((bot)=>bot.package.manifest.id===value.id))throw new Error(`Package ID ${value.id} already exists in this Studio/Project namespace.`);let next=addProjectPackage(current,value.id,kind,value.authoring_language);next=cloneStudioWorkspace(next);const pkg=selectedProject(next).packages.find((row)=>row.manifest.id===value.id);if(!pkg)throw new Error(`Project Package ${value.id} was not created.`);pkg.manifest.description=value.description;return touchStudioWorkspace(next); }

function projectFormLanguages(studio:StudioWorkspace,project?:StudioProject):string[] { const seen=new Set<string>();return [...(project?projectAvailableLanguages(project):[]),...sharedAvailableLanguages(studio)].filter((language)=>{const key=languageKey(language);if(seen.has(key))return false;seen.add(key);return true;}); }
function validStudioId(value:string):boolean { return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.trim()); }

function OverrideContentModal(props: { studio: StudioWorkspace; baseId: string; onClose: () => void; applyStudio: (fn: (current: StudioWorkspace) => StudioWorkspace, message?: string) => boolean }) {
  const rows = overrideableContributions(props.studio, props.baseId);
  return <Modal title={`Override content · ${props.baseId}`} size="workspace" onClose={props.onClose}><div className="editor-layout">
    <div className="editor-scroll">
      <p className="muted small">Choose inherited content to specialize. Bot replacements are stored in this Bot's one private Bot Package; the source Package stays unchanged.</p>
      {rows.length === 0 ? <EmptyState title="Nothing left to override" text="All exported contributions from this Package already have an explicit override at this scope." /> : <div className="item-stack">{rows.map((row) => <div className="inline-form-row" key={`${String(row.namespace)}:${row.id}`}><div className="grow"><strong>{humanize(String(row.namespace))}</strong><div className="mono tiny muted">{row.id}</div><div className="tiny muted">from {row.source_package}</div></div><button onClick={() => props.applyStudio((current) => overrideContribution(current, props.baseId, row.namespace, row.id), "Contribution overridden")}>Override</button></div>)}</div>}
    </div>
    <div className="sticky-editor-footer"><span className="footer-spacer" aria-hidden="true" /><button onClick={props.onClose}>Close</button></div>
  </div></Modal>;
}

function projectPackageDeleteMessage(studio: StudioWorkspace, packageId: string): string {
  const impact = projectPackageRemovalImpact(studio, packageId);
  const pkg = selectedProject(studio).packages.find((row) => row.manifest.id === packageId);
  if (pkg?.manifest.kind === "fallback") return `Remove ${packageId} from this Project? Bots using it will return to no authored Fallback Package.`;
  const dependents = impact.package_ids.filter((id) => id !== packageId);
  const parts = [`Remove ${packageId} from this Project?`];
  if (dependents.length) parts.push(`Dependent Project Packages also removed: ${dependents.join(", ")}.`);
  if (impact.bot_ids.length) parts.push(`${impact.bot_ids.length} Bot${impact.bot_ids.length === 1 ? "" : "s"} will stop using the affected Package${impact.package_ids.length === 1 ? "" : "s"}: ${impact.bot_ids.join(", ")}.`);
  return parts.join(" ");
}
