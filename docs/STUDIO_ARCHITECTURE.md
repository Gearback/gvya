# GVYA Studio Architecture

## Boundary

GVYA Studio is the optional human-facing visual editor and simulator for GVYA source. It is not the machine-authoring API, runtime, compiler, matcher, or semantic authority.

```text
Portable content root
  studio.json
  shared/language-profiles/<language>.json
  shared/matcher-profiles/<language>.json
  Shared Packages
    packages/standard/<package-id>/package.json
                                  /authoring.json (optional human metadata)
    packages/fallback/<package-id>/package.json
                                  /authoring.json (optional human metadata)
  Projects
    <project-id>/project.json
    <project-id>/language-profiles/<language>.json
    <project-id>/matcher-profiles/<language>.json
    packages/standard/<package-id>/package.json
                                  /authoring.json (optional human metadata)
    packages/fallback/<package-id>/package.json
                                  /authoring.json (optional human metadata)
      explicit authoring language backed by a Project Matcher Profile
    Bots
      <bot-id>/bot.json
      <bot-id>/package/package.json
                       /authoring.json (optional human metadata)
      enabled runtime-language subset from the Project Language/Matcher Profile pairs
      explicit default language from that enabled subset
      exactly one Bot Package (authoring language derived from Bot default)
      selected Shared or Project-owned Standard Package IDs
      optional selected Shared or Project-owned Fallback Package ID
      Bot-only Standard Package replacements
      Bot setting overrides
        ↓
ordinary GVYA package graph + effective Bot settings
        ↓
gvya.source.project/1 + gvya.source.package/1
        ↓
Rust compiler → one .gvya
```

The Studio hierarchy is authoring organization only. The compiler never receives Shared/Project/Bot precedence rules.

## Global navigation

The sidebar is intentionally fixed and minimal:

1. **Projects**
2. **Shared Packages**
3. **Settings**

Bot concerns and Package authoring are separate contextual surfaces: Bots own Overview/Packages/Simulate/Settings/Build, while Package editors own Teach/Behaviors/Capabilities/Assets/Simulate/Audit.

The top bar is navigation, not a workspace toolbar. It contains a clickable hierarchy breadcrumb such as:

`Projects > My Project > Test Bot`

When a Package editor is open, the hierarchy preserves the navigation context that opened it. A Package opened from a Bot therefore reads `Projects > My Project > Test Bot > package.id`, while a Project Package remains `Projects > My Project > package.id`. A compact provenance badge beside the breadcrumb identifies the actual write owner: **Shared package**, **Project package**, or **Bot package**. The selected package scope never disappears merely because the Package was opened through a Bot.

Browser Back/Forward is first-class Studio navigation. Route changes use the browser History API and a readable URL hash; Project Bots and Project Packages are distinct history locations, as are Bot tabs and Package editor tabs. Back returns to the exact list/context that opened the current object without rolling source edits backward. Undo/Redo/Save/Open are not persistent global chrome. Browser autosave remains implementation infrastructure; import/export actions live with the object/scope they affect.

### Transactional object authoring

New/Edit authoring modals are draft transactions, not live views over canonical source. Opening a modal, typing, toggling fields, adding nested rows, or pressing an Add/New entry point changes only modal-local draft state. The owning modal shows its validation issues in place. **Save/Create is enabled only when blocking validation is clean and performs one canonical commit.** Cancel/close discards the draft completely.

This rule covers the human-authored source objects: Projects, Bots, Packages, Behaviors (including Meanings/Responses), Capabilities (including Bindings/Policies), and Assets. Nested edits inside a Behavior or Capability inherit the surrounding draft transaction. Manage Packages is likewise staged until `Save changes`. Explicit destructive actions such as Delete and ordinary immediate Settings values are not create/edit drafts and remain separate explicit operations.

Regression Cases and Conversation Scenarios remain canonical Package source, but Studio does not expose a human test editor. External authoring agents maintain them through canonical source and the Rust CLI; humans inspect resulting quality and coverage through Audit.

## Canonical Studio model

The disk authority is the `content/` folder tree, not a monolithic browser database. Studio assembles that tree into its strict `gvya.studio.workspace/1` in-memory model. Object-authoring drafts stay outside persisted source until explicitly saved; there is no migration or compatibility reader.

A Project owns only organization and Project-scoped Package state:

- one standalone Matcher Profile JSON document for every language available in that Project;
- zero or more Standard and Fallback Project Packages owned only by that Project;
- one or more Bots.

A Project never attaches or overrides Shared Packages. It may author its own Standard and Fallback Packages. A new Project starts with no Project Packages of either kind.

A Bot is the human UI name for one GVYA Brain compile target. Every Bot:

- explicitly selects a non-empty enabled runtime-language subset from the languages defined by its Project Language/Matcher Profile pairs;
- explicitly selects one default language from that enabled subset during Bot creation/editing; the default is always enabled and cannot be unchecked;
- owns exactly one Bot Package from creation until Bot deletion; that Package cannot be detached, independently deleted, or shared with another Bot;
- may select zero or more Standard Packages from Shared scope or its owning Project without copying Shared source into the Project;
- may select zero or one Shared or Project-owned Fallback Package; the default is `None`;
- writes Bot-specific standard content and every selected Standard Package replacement into that one Bot Package;
- never owns a second local/override Package;
- may inherit Studio semantic and scalar conversation defaults while being edited, but owns numeric author memory itself and `bot.json` materializes the complete effective settings so a copied Project never changes with another machine's Studio defaults;
- uses the Project Language/Matcher Profile pair set as its authoring catalog without automatically enabling every Project language at runtime;
- compiles to exactly one `.gvya` artifact.

Global **Settings** owns semantic and scalar conversation defaults only. Numeric author memory is Bot-owned: Bot Settings exposes a separate **Numeric Bot memory** card with `path/default/min/max` rows, and every Bot persists its own complete `author_numbers` list without a Studio-level inherited default. Bot Settings can specialize the remaining effective conversation configuration without an override-mode UI. Human Behavior authoring exposes the optional per-Behavior repeat thresholds, while `repair_continuation_candidate` remains a source/runtime-only field so ordinary authors do not casually turn Behaviors into repair candidates. Paired `shared/language-profiles/*.json` and `shared/matcher-profiles/*.json` define the languages available when creating a Project; selected pairs are copied into the Project so it remains portable. The corresponding paired Project files form its sole language catalog. Profile order is authoring order, never runtime preference. Each Bot selects its enabled subset and default from that catalog. Changing the default enables the new default automatically; the former default remains enabled but becomes editable. Meanings and responses retain their own explicit language tags.

Deleting a Matcher Profile never rewrites authored Bot or Package data. A Bot whose enabled languages or resolved Package graph references an uncovered language remains loadable but is **Disabled**: only Overview is reachable and it names every missing profile. A Shared or Project Package whose own content or dependency graph references an uncovered language follows the same Overview-only Disabled contract. Disabled Packages are excluded from Standard and Fallback Package choices for Bots, and model mutations enforce the same rule independently of the UI. Restoring the JSON document or editing the authored language usage repairs the object.

Every Shared or Project Package selects one `authoring_language` backed by its owning scope's Language/Matcher Profile pairs. This is only the default language opened by human authoring forms and Package preview; it is Studio metadata and never enters canonical compiler source, artifacts, matching, or runtime fallback. A Bot Package has no independent choice: its authoring language is always derived from the Bot default and follows default-language edits.

Studio also keeps an authoring-only **Review Queue** of unresolved or repair-continuation inputs observed in Bot Simulate. Entries retain the normalized authoring evidence needed for review (input/language/count/reason/best candidate/score), are deduplicated deterministically, can be dismissed/cleared, persist in `studio.json`, and never compile into a Brain.

Project-level runtime settings do not exist. Bot Settings presents ordinary semantic/conversation values without explicit override toggles. The in-memory editor may represent equal values compactly, but persistence writes the complete effective Bot values into `bot.json` for Project portability.

## Shared Packages, Fallback Packages and Bot-only Standard overrides

Packages have stable IDs and live authoring state; Studio has no author-facing Package versions, pins, or automatic recovery revisions. Editing a Shared Package edits that Package directly. A human may explicitly download the selected Package folder as `<package-id>-YYYY-MM-DD.zip` from Package Overview. The ZIP contains the complete current Package folder, including canonical fragments, tests, authoring metadata, and declared Asset bytes. Build reproducibility comes from canonical source/content SHA-256, not author-facing Package version numbers or backup archives.

The Shared Packages surface has two distinct tabs: **Packages** for ordinary Standard Packages and **Fallback Packages** for self-contained fallback authoring. A Project's Packages tab mirrors those two ownership categories as vertically ordered **Project Packages** and **Project Fallback Packages** sections. Bot Packages are always Standard Packages.

A fresh Studio workspace includes two ordinary Shared Fallback Packages, `gvya.fallback.formal` and `gvya.fallback.informal`. Their localized `unresolved` and `repeat` behaviors follow the languages supplied by the starter Language/Matcher Profile pairs. They are editable/deletable package data, not kernel behavior, and neither is selected for a Bot implicitly. The kernel has no privileged language pair: Shared and Project language catalogs come only from explicit Matcher Profile documents.

Each Bot may select exactly zero or one Shared or Project-owned Fallback Package. Selection stores only the Package ID and defaults to `None`; no Shared source is copied into the Project. Fallback Packages cannot be attached as ordinary packages, cannot be edited through Bot Override, and cannot be overridden or specialized. Deleting the selected owning Package clears the Bot selection.

Shared Packages are globally reusable live authoring sources. A Bot may reference a Shared Package ID directly; Studio resolves that Package and its dependency closure from Shared scope whenever it materializes the Bot. Compile/build materializes the resolved canonical Package root plus explicitly declared fragment files and finally into the `.gvya` artifact. It never persists those snapshots under the Project. Shared edits therefore affect every Bot that selects that source, while Project Packages remain visible only to Bots in their owning Project. Shared, Project-owned, and Bot-owned Package IDs must be unique within each Project graph so an ID has exactly one source owner. Neither Shared nor Project scope has an override layer.

Standard contribution Override exists only at Bot scope. A Bot does not create a separate override Package: explicit whole-contribution `Replace { target_package, target_id }` contributions are written into the Bot's one structural Bot Package. The Shared or Project-owned source Package is unchanged, unchanged contributions are not copied, and the human never chooses dependency layers.

Selected Shared and Project-owned Packages are read-only from Bot scope; the Bot Package owns all Bot-local changes and Standard replacements.

## Contextual surfaces

A **Project** exposes only:

- Bots
- Packages

A **Bot** exposes:

- Overview
- Packages
- Simulate
- Build
- Settings

Bot Overview offers a direct **Teach by chatting** action that opens its owned Standard Bot Package Teach tab without requiring a detour through Package management. Bot Overview also offers an explicit `<bot-id>-YYYY-MM-DD.zip` download containing the current Bot folder and its owned Package. Referenced Shared or Project Packages remain declared external dependencies and are not copied into that Bot-folder archive.

A Bot never embeds Package authoring controls into its Overview or Settings surface. The Packages tab is ordered **Bot Package → Added Packages → Fallback Package**. It shows the one non-removable Bot Package, selected Shared/Project Standard Packages with their true owner, then the separate Fallback selector. `Manage Packages` lists only Shared/Project choices whose complete dependency graph is covered by the Project Language/Matcher Profile pairs and atomically applies the ID selection without copying source. Clicking a selected Standard or Fallback Package opens its owning scope; Bot-level Standard Override writes into the Bot Package. Fallback selection has no Override action.

A **Standard Package** exposes:

- Behaviors
- Capabilities
- Assets
- Simulate
- Audit

Package Overview offers the explicit dated Package-folder ZIP download. Studio does not create automatic Package backups.

**Teach** is a progressive, chat-first authoring surface for Standard Packages. It previews the selected Package and dependency closure with the same bundled canonical Rust compiler/runtime as Package Simulate. A visible NPC turn may be accepted without a source change, given another localized variant, corrected in the exact selected normal response, or used as evidence to create a new Meaning/Behavior/Response pair with an optional topic. No JavaScript matcher, AI provider, independent runtime, hidden test author, or separate Teach schema is introduced. Teach writes to the selected owning Package only: dependency and fallback results cannot be silently rewritten, conditional/special responses are not guessed, and edits are local drafts until explicit Save. Existing conversations restart when the accepted source changes. Technical context, source identifiers, localized authoring choice, and topic scoping remain behind Advanced; the full Behaviors editor and Package Simulate remain available for precise work. A new semantic sample can still compete with existing evidence, so a newly taught intent is not a guarantee that Rust matching will select it until tested.


There is no Package Languages tab and no generic `localizations` contribution namespace. Multilingual conversation authoring lives with the object that owns the text: Meaning structural patterns and semantic samples in Behaviors, response/extra-message text in responses, and utterance language in tests/scenarios. Audit reports sample, response-variant and utterance-step test counts for every Matcher-Profile-defined Project language. Conversation scenarios may also contain non-utterance interaction steps such as open, confirmation and capability-result delivery.

A standard Behavior editor keeps **Structural patterns** visibly separate from semantic samples. Structural rows are explicit whole-utterance rules and expose language, rule text and priority. The editor documents `*` (one-or-more), `^` (zero-or-more), named String captures and Matcher Profile set references; wildcard-only catch-all patterns are not a substitute for GVYA Fallback Packages. Studio stores these rows directly as canonical Meaning `patterns` and does not implement a JavaScript matcher. Matcher Profile `pattern_sets` remain part of the transparent profile JSON rather than a second Studio-owned vocabulary model. Compiler/kernel audit remains matching authority.

A **Fallback Package** exposes fallback-specific authoring headed by **Fallback Behaviors** instead of Meaning/normal Behavior matching. Each Fallback Behavior authors trigger, priority, typed conditions and responses; it may use normal response effects/follow-up/assets, but it has no Meaning, samples, negative samples, retrieval terms or semantic priority. Its Simulate tab exercises that fallback Package in the same isolated Package-preview path.

`Build` belongs to a Bot because `.gvya` is the resolved output of one Bot. Package authoring does not expose Build.
The web Studio bundles versioned canonical Rust Engine assets. Bot Simulate compiles the currently selected resolved Bot transiently. Package Simulate instead compiles a synthetic Package-rooted Brain containing the selected Package and only its required dependency graph, using global or Project language/config defaults and no Bot composition or Bot settings. Both paths immediately open the in-memory `.gvya` bytes with runtime exports from the same bundled Engine module. Build uses that module's compiler exports. Humans never select WASM or intermediate artifacts, and Studio has no JavaScript semantic/compiler/runtime fallback.

Web Export is a **distribution container**, not another artifact meaning. It compiles the resolved Bot to the ordinary canonical `.gvya`, then packs that artifact unchanged together with the Engine WASM, the SDK modules and a minimal browser bootstrap into a deterministic path-sorted ustar stream wrapped in one gzip member (`<bot>-web-<engine>.tar.gz`, `application/gzip`). Standard tooling unpacks it with `tar -xzf`. `.gvya` never means "web distribution bundle"; no Studio hierarchy, project manifest, package source or authoring sidecar enters the container.

Source Export is the other distribution container and uses the same codec: the resolved compiler source tree is packed into a deterministic path-sorted ustar stream in one gzip member (`<bot>.gvya-source.tar.gz`, `application/gzip`). Import decompresses under an explicit byte budget before parsing, so a small archive cannot expand without limit. There is no raw-TAR reader: the uncompressed `.gvya-source.tar` form is retired, not accepted alongside the compressed one.

## Human interaction rules

Resource collections are row-based lists, not card grids. The resource title opens the resource. Edit uses a compact edit icon; remove uses a compact trash action.

Dense authoring resources follow a **list-first editor** rule. Behaviors and capability contracts are never squeezed into a permanent list+form split view. Their contextual tab shows the scannable/filterable collection at page width; selecting an item opens the existing editor in a large, tall Studio modal with its own scrolling body and sticky editor actions. Creating a Behavior or Capability creates the ordinary source contribution and opens that same editor modal. This is a human-authoring layout rule only and adds no alternate source/runtime semantics.

A Package editor is bound to exactly one Package selected by navigation. Package authoring pages never contain a package-switch dropdown. To work on a different Package, return to the relevant Package list (Shared, Project, or Bot) and open that Package. This preserves object identity and prevents unrelated package composition controls from leaking into authoring forms.

The top breadcrumb represents only object hierarchy (for example `Projects > My Project > Test Bot`); contextual authoring tab names such as Behaviors, Capabilities, Simulate, or Settings never appear in the breadcrumb. Package provenance is metadata beside that hierarchy, not a contextual tab. Browser Back/Forward follows the same navigation model and never mutates authored source. Starter/default Projects, Bots, Shared Packages, and Project Packages are ordinary resources and may be removed. The sole non-independent Package is the structural Bot Package: it exists exactly while its Bot exists, cannot be deleted separately, and is removed with the Bot. Confirmed Standard Package deletion cleans Bot memberships and affected Bot replacements; confirmed Fallback Package deletion clears affected Bot selections. No dangling package reference remains.

All create/edit flows use the same custom Studio modal system. All destructive operations require confirmation in that modal system. Browser-native `alert`, `confirm`, and `prompt` are forbidden.

Studio modals:

- have one visual/interaction design;
- have a visible Close control;
- use a dark blocking overlay;
- do not dismiss or pass clicks through when the overlay is clicked;
- trap keyboard focus and inert the background;
- restore focus on close;
- close on Escape;
- are movable by dragging the modal header only.

Transient feedback uses bottom-center toasts. Autosave is silent when successful; only autosave failure is surfaced. Navigation never emits a toast. All toast kinds dismiss automatically; success notices are brief, informational notices remain slightly longer, and errors remain long enough to read. Errors are not overwritten by later non-error notices while visible.

## Machine authoring is outside Studio

AI-first means capable external agents can inspect, create, edit, audit, test, simulate, and build the same transparent GVYA source that Studio edits. Machine authors consume `gvya author-step BASE CANDIDATE --json` and the embedded `check-change/1` result directly through the canonical CLI; Studio does not mirror that machine contract as a human-facing status screen. Studio does not persist provider endpoints, models, credentials, token budgets, prompt/session state, proposals, retry policy, or a second mechanic classifier. Candidate edits and retries remain external; promotion remains explicit and BASE stays immutable until that external/human promotion.

The machine interface is `gvya.source.project/1`, `gvya.source.package/1`, referenced assets, and the structured output of the canonical Rust CLI. The external agent host owns source-document extraction and all model orchestration. Studio remains a human client of the source model; details are defined in `MACHINE_AUTHORING_ARCHITECTURE.md`.

## Persistence and source boundary

The local content host scans and writes one portable `content/` root. `studio.json` stores semantic/conversation defaults and current selection; Shared and Project profile pairs are discovered from their `language-profiles/` and `matcher-profiles/` directories; Package inventories come from `standard/` and `fallback/`; Project and Bot inventories come from folders. `project.json` contains Project identity, not a redundant language list. Every `package.json` is directly canonical `gvya.source.package/1`: it owns the Package manifest and explicit fragment index, while contribution objects live in declared `fragments/` files consumed by the same compiler. An external agent therefore edits the exact fragment that owns an object instead of rewriting a monolithic Package document. Optional `authoring.json` contains only human-editor metadata and bounded recovery snapshots; it is not compiler source. Assets remain relative to their owning Package root. There is no IndexedDB-authored-state authority and no hardcoded default Package registry.

Writes use an optimistic content revision and an atomic directory replacement. If a file is dropped in or edited after Studio loaded, autosave fails with a reload instruction instead of overwriting that external change. Storage failures are surfaced and never reported as successful saves.

Copying `content/` moves the complete Studio. A Project folder carries its Matcher Profiles, Bots, Project-owned Packages, and full effective runtime settings, but any selected Shared Package IDs still resolve against the destination content root's Shared library. Build/export resolves those live references into ordinary compiler source and produces a self-contained `.gvya`; the artifact contains no Studio hierarchy or authoring ownership boundary.


## Zero-setup simulation

Simulate is an authoring operation, not a deployment operation. Bot Simulate prepares the resolved Bot; Package Simulate prepares an isolated Package-rooted dependency graph without creating or mutating a Bot. It exposes no language selector: each turn's winning localized sample or structural pattern selects the response language and updates the active session language. Fallback keeps that active language, or uses the compiled Bot default before any match; it never reads the first Project language as preference. Source changes invalidate only the transient artifact fingerprint; they do not rebuild Engine WASM. Engine assets are integrity-checked internal product assets described in `ENGINE_ASSETS.md`.
