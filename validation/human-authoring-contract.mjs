import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contribution, createBinding, createCapability, createPackage, createPolicy, createRegressionCase, createScenario, createStarterBrainWorkspace, packageSnapshotDocument } from "../apps/studio/dist/workspace.js";
import { behaviorDeleteImpacts, capabilityDeleteImpacts, deleteBehaviorPair, deleteCapabilityAtomic, deleteResponseAtomic, groupBehaviorRows, renameBehaviorAtomic, renameCapabilityIdentityAtomic, renameMeaningAtomic, renamePackageAtomic, renameResponseAtomic, responseDeleteImpacts, validateAuthorId, validateAuthorVersion, validatePackageId } from "../apps/studio/dist/human-authoring.js";
import { createStarterStudioWorkspace } from "../apps/studio/dist/studio-model.js";
import { teachConversation, teachResponseTarget } from "../apps/studio/dist/studio-teach.js";
import { studioWorkspaceFromText, studioWorkspaceToText } from "../apps/studio/dist/studio-workspace-io.js";

const base = createStarterBrainWorkspace();
const source = base.packages[0];
const behaviorId = source.contents.behaviors[0].value.id;
const meaningId = source.contents.behaviors[0].value.meaning;
const responseId = source.contents.behaviors[0].value.responses[0].id;

const dependent = createPackage("dependent");
dependent.manifest.dependencies = [{ id: source.manifest.id, reexport: false }];
const binding = createBinding("dependent.binding", "host.echo");
binding.trigger = { meaning: meaningId, behavior: behaviorId, response: responseId };
dependent.contents.capability_bindings.push(contribution(binding.id, binding));
const dependentTest = createRegressionCase("dependent.test");
dependentTest.input = "hello";
dependentTest.expectation.meaning = meaningId;
dependentTest.expectation.response_ids = [responseId];
dependent.contents.regression_cases.push(contribution(dependentTest.id, dependentTest));

const unrelated = createPackage("unrelated");
const unrelatedBinding = createBinding("unrelated.binding", "host.echo");
unrelatedBinding.trigger = { meaning: meaningId, behavior: behaviorId, response: responseId };
unrelated.contents.capability_bindings.push(contribution(unrelatedBinding.id, unrelatedBinding));
base.packages.push(dependent, unrelated);

assert.equal(validateAuthorId("good.behavior"), null);
assert.match(validateAuthorId("bad id"), /whitespace/u);
assert.match(validateAuthorId("   "), /empty/u);

const behaviorRenamed = renameBehaviorAtomic(base, source.manifest.id, behaviorId, "greeting.renamed.behavior");
assert.equal(behaviorRenamed.packages[0].contents.behaviors[0].value.id, "greeting.renamed.behavior");
assert.equal(behaviorRenamed.packages.find((p) => p.manifest.id === "dependent").contents.capability_bindings[0].value.trigger.behavior, "greeting.renamed.behavior");
assert.equal(behaviorRenamed.packages.find((p) => p.manifest.id === "unrelated").contents.capability_bindings[0].value.trigger.behavior, behaviorId);
assert.throws(() => renameBehaviorAtomic(behaviorRenamed, source.manifest.id, "greeting.renamed.behavior", "bad id"), /whitespace/u);

const meaningRenamed = renameMeaningAtomic(behaviorRenamed, source.manifest.id, meaningId, "greeting.renamed");
assert.equal(meaningRenamed.packages[0].contents.behaviors[0].value.meaning, "greeting.renamed");
assert.equal(meaningRenamed.packages.find((p) => p.manifest.id === "dependent").contents.regression_cases[0].value.expectation.meaning, "greeting.renamed");
assert.equal(meaningRenamed.packages.find((p) => p.manifest.id === "unrelated").contents.capability_bindings[0].value.trigger.meaning, meaningId);

const responseRenamed = renameResponseAtomic(meaningRenamed, source.manifest.id, "greeting.renamed.behavior", responseId, "greeting.renamed.response");
assert.equal(responseRenamed.packages[0].contents.behaviors[0].value.responses[0].id, "greeting.renamed.response");
assert.deepEqual(responseRenamed.packages.find((p) => p.manifest.id === "dependent").contents.regression_cases[0].value.expectation.response_ids, ["greeting.renamed.response"]);
assert.equal(responseRenamed.packages.find((p) => p.manifest.id === "unrelated").contents.capability_bindings[0].value.trigger.response, responseId);

const impacts = behaviorDeleteImpacts(responseRenamed, source.manifest.id, "greeting.renamed.behavior");
assert.ok(impacts.some((row) => row.kind === "binding" && row.packageId === "dependent"));
assert.ok(impacts.some((row) => row.kind === "test"));
assert.throws(() => deleteBehaviorPair(responseRenamed, source.manifest.id, "greeting.renamed.behavior"), /dependent reference/u);

const deletable = structuredClone(responseRenamed);
deletable.packages[0].contents.regression_cases = [];
deletable.packages.find((p) => p.manifest.id === "dependent").contents.capability_bindings = [];
deletable.packages.find((p) => p.manifest.id === "dependent").contents.regression_cases = [];
assert.equal(behaviorDeleteImpacts(deletable, source.manifest.id, "greeting.renamed.behavior").length, 0);
const deleted = deleteBehaviorPair(deletable, source.manifest.id, "greeting.renamed.behavior");
assert.equal(deleted.packages[0].contents.behaviors.length, 0);
assert.equal(deleted.packages[0].contents.meanings.length, 0);


const responseDeleteWorkspace = createStarterBrainWorkspace();
const responseDeleteBehavior = responseDeleteWorkspace.packages[0].contents.behaviors[0].value;
assert.ok(responseDeleteImpacts(responseDeleteWorkspace, "conversation", responseDeleteBehavior.id, responseDeleteBehavior.responses[0].id).some((row) => row.kind === "minimum_response"));
responseDeleteBehavior.responses.push(structuredClone(responseDeleteBehavior.responses[0]));
responseDeleteBehavior.responses[1].id = "greeting.hello.response.alt";
assert.equal(responseDeleteImpacts(responseDeleteWorkspace, "conversation", responseDeleteBehavior.id, "greeting.hello.response.alt").length, 0);
const responseDeleted = deleteResponseAtomic(responseDeleteWorkspace, "conversation", responseDeleteBehavior.id, "greeting.hello.response.alt");
assert.equal(responseDeleted.packages[0].contents.behaviors[0].value.responses.length, 1);


const identityWorkspace = createStarterBrainWorkspace();
const identityPackage = identityWorkspace.packages[0];
const identityCapability = createCapability("host.echo");
identityPackage.contents.capabilities.push(contribution("host.echo", identityCapability));
const conflictCapability = createCapability("host.conflict");
identityPackage.contents.capabilities.push(contribution("host.conflict", conflictCapability));
const identityBinding = createBinding("host.echo.binding", "host.echo");
identityPackage.contents.capability_bindings.push(contribution(identityBinding.id, identityBinding));
const identityPolicy = createPolicy("host.echo.policy", "host.echo");
identityPackage.contents.capability_policies.push(contribution(identityPolicy.id, identityPolicy));
identityPackage.contents.capability_result_behaviors.push(contribution("host.echo.result", { id: "host.echo.result", capability: "host.echo", capability_version: "1", succeeded: true, error_code: "", responses: [] }));
const identityRegression = createRegressionCase("host.echo.regression");
identityRegression.expectation.capabilities = [{ id: "host.echo", version: "1", arguments: null }];
identityRegression.expectation.proposal_receipts = [{ id: "host.echo", version: "1", arguments: { echoed: true }, outcome: "needs_confirmation", reason_code: "confirm.echo" }];
identityRegression.expectation.forbidden_capabilities = ["host.echo"];
identityRegression.context.available_capabilities = [{ id: "host.echo", version: "1" }];
identityPackage.contents.regression_cases.push(contribution(identityRegression.id, identityRegression));
const identityScenario = createScenario("host.echo.scenario");
identityScenario.context.available_capabilities = [{ id: "host.echo", version: "1" }];
identityScenario.steps[0].context = { values: {}, visible_references: [], available_capabilities: [{ id: "host.echo", version: "1" }] };
identityScenario.steps[0].expectation.capabilities = [{ id: "host.echo", version: "1", arguments: null }];
identityScenario.steps[0].expectation.proposal_receipts = [{ id: "host.echo", version: "1", arguments: null, outcome: "admitted", reason_code: "" }];
identityScenario.steps.push({ type: "confirm", proposal_from_step: 1, proposal_capability: "host.echo", proposal_ordinal: null, confirmed: true, context: null, unix_time_ms: null, expectation: createRegressionCase("temp").expectation });
identityScenario.steps.push({ type: "capability_result", proposal_from_step: 1, proposal_capability: "host.echo", proposal_ordinal: null, succeeded: true, output: { echoed: true }, error_code: "", language: "en-US", context: null, seed: 2, unix_time_ms: null, expectation: createRegressionCase("temp").expectation });
identityPackage.contents.scenarios.push(contribution(identityScenario.id, identityScenario));
const specializationPackage = createPackage("specialization");
specializationPackage.manifest.dependencies = [{ id: identityPackage.manifest.id, reexport: false }];
const replacementCapability = createCapability("replacement.capability");
const replacementRow = contribution("replacement.capability", replacementCapability);
replacementRow.mode = { type: "replace", target_package: identityPackage.manifest.id, target_id: "host.echo" };
specializationPackage.contents.capabilities.push(replacementRow);
identityWorkspace.packages.push(specializationPackage);
const capabilityImpacts = capabilityDeleteImpacts(identityWorkspace, identityPackage.manifest.id, "host.echo");
assert.ok(capabilityImpacts.some((row) => row.kind === "result_handler"));
assert.ok(capabilityImpacts.some((row) => row.kind === "test"));
assert.ok(capabilityImpacts.some((row) => row.kind === "scenario"));
assert.ok(capabilityImpacts.some((row) => row.kind === "specialization"));
assert.throws(() => deleteCapabilityAtomic(identityWorkspace, identityPackage.manifest.id, "host.echo"), /dependent reference/u);

const capabilityDeleteWorkspace = createStarterBrainWorkspace();
const capabilityDeletePackage = capabilityDeleteWorkspace.packages[0];
const deletableCapability = createCapability("host.remove");
capabilityDeletePackage.contents.capabilities.push(contribution(deletableCapability.contract.id, deletableCapability));
const ownedBinding = createBinding("host.remove.binding", "host.remove");
const ownedPolicy = createPolicy("host.remove.policy", "host.remove");
capabilityDeletePackage.contents.capability_bindings.push(contribution(ownedBinding.id, ownedBinding));
capabilityDeletePackage.contents.capability_policies.push(contribution(ownedPolicy.id, ownedPolicy));
assert.equal(capabilityDeleteImpacts(capabilityDeleteWorkspace, capabilityDeletePackage.manifest.id, "host.remove").length, 0);
const capabilityDeleted = deleteCapabilityAtomic(capabilityDeleteWorkspace, capabilityDeletePackage.manifest.id, "host.remove");
assert.ok(!capabilityDeleted.packages[0].contents.capabilities.some((row) => row.value.contract.id === "host.remove"));
assert.ok(!capabilityDeleted.packages[0].contents.capability_bindings.some((row) => row.value.capability === "host.remove"));
assert.ok(!capabilityDeleted.packages[0].contents.capability_policies.some((row) => row.value.capability === "host.remove"));
assert.throws(() => renameCapabilityIdentityAtomic(identityWorkspace, identityPackage.manifest.id, "host.echo", "1", "host.conflict", "2"), /already exists/u);

const capabilityRenamed = renameCapabilityIdentityAtomic(identityWorkspace, identityPackage.manifest.id, "host.echo", "1", "host.echo.renamed", "2");
const renamedIdentityPackage = capabilityRenamed.packages.find((p) => p.manifest.id === identityPackage.manifest.id);
assert.equal(renamedIdentityPackage.contents.capabilities[0].id, "host.echo.renamed");
assert.equal(renamedIdentityPackage.contents.capabilities[0].value.contract.id, "host.echo.renamed");
assert.equal(renamedIdentityPackage.contents.capabilities[0].value.contract.version, "2");
assert.equal(renamedIdentityPackage.contents.capability_bindings[0].value.capability, "host.echo.renamed");
assert.equal(renamedIdentityPackage.contents.capability_policies[0].value.capability, "host.echo.renamed");
assert.equal(renamedIdentityPackage.contents.capability_result_behaviors[0].value.capability, "host.echo.renamed");
assert.equal(renamedIdentityPackage.contents.capability_result_behaviors[0].value.capability_version, "2");
assert.deepEqual(renamedIdentityPackage.contents.regression_cases.find((row) => row.id === identityRegression.id).value.expectation.capabilities.map((row) => [row.id, row.version]), [["host.echo.renamed", "2"]]);
assert.deepEqual(renamedIdentityPackage.contents.regression_cases.find((row) => row.id === identityRegression.id).value.expectation.proposal_receipts.map((row) => [row.id, row.version, row.outcome, row.reason_code]), [["host.echo.renamed", "2", "needs_confirmation", "confirm.echo"]]);
assert.deepEqual(renamedIdentityPackage.contents.regression_cases.find((row) => row.id === identityRegression.id).value.expectation.forbidden_capabilities, ["host.echo.renamed"]);
assert.deepEqual(renamedIdentityPackage.contents.regression_cases.find((row) => row.id === identityRegression.id).value.context.available_capabilities, [{ id: "host.echo.renamed", version: "2" }]);
assert.deepEqual(renamedIdentityPackage.contents.scenarios[0].value.context.available_capabilities, [{ id: "host.echo.renamed", version: "2" }]);
assert.deepEqual(renamedIdentityPackage.contents.scenarios[0].value.steps[0].context.available_capabilities, [{ id: "host.echo.renamed", version: "2" }]);
assert.deepEqual(renamedIdentityPackage.contents.scenarios[0].value.steps[0].expectation.capabilities.map((row) => [row.id, row.version]), [["host.echo.renamed", "2"]]);
assert.deepEqual(renamedIdentityPackage.contents.scenarios[0].value.steps[0].expectation.proposal_receipts.map((row) => [row.id, row.version, row.outcome]), [["host.echo.renamed", "2", "admitted"]]);
assert.equal(renamedIdentityPackage.contents.scenarios[0].value.steps[1].proposal_capability, "host.echo.renamed");
assert.equal(renamedIdentityPackage.contents.scenarios[0].value.steps[2].proposal_capability, "host.echo.renamed");
const serializedIdentityScenario = packageSnapshotDocument(renamedIdentityPackage).contents.scenarios[0].value;
assert.ok(Array.isArray(serializedIdentityScenario.steps));
assert.equal(Object.prototype.hasOwnProperty.call(serializedIdentityScenario, "turns"), false);
assert.deepEqual(serializedIdentityScenario.steps.map((step) => step.type), ["turn", "confirm", "capability_result"]);
assert.deepEqual(serializedIdentityScenario.steps[0].expectation.proposal_receipts, [{ id: "host.echo.renamed", version: "2", outcome: "admitted" }]);
assert.equal(capabilityRenamed.packages.find((p) => p.manifest.id === "specialization").contents.capabilities[0].mode.target_id, "host.echo.renamed");
assert.match(validateAuthorVersion("bad version"), /whitespace/u);

const packageRenameWorkspace = createStarterBrainWorkspace();
const packageRenameDependent = createPackage("dependent.package");
packageRenameDependent.manifest.dependencies = [{ id: "conversation", reexport: false }];
const packageReplacement = createCapability("replace.any");
const packageReplacementRow = contribution("replace.any", packageReplacement);
packageReplacementRow.mode = { type: "replace", target_package: "conversation", target_id: "missing" };
packageRenameDependent.contents.capabilities.push(packageReplacementRow);
packageRenameWorkspace.packages.push(packageRenameDependent);
const packageRenamed = renamePackageAtomic(packageRenameWorkspace, "conversation", "conversation.renamed");
assert.equal(packageRenamed.selectedPackageId, "conversation.renamed");
assert.equal(packageRenamed.packages[0].path, "packages/conversation.renamed/package.json");
assert.equal(packageRenamed.packages[1].manifest.dependencies[0].id, "conversation.renamed");
assert.equal(packageRenamed.packages[1].contents.capabilities[0].mode.target_package, "conversation.renamed");
assert.match(validatePackageId("../escape"), /path separators/u);
assert.throws(() => renamePackageAtomic(packageRenamed, "conversation.renamed", "dependent.package"), /already exists/u);

const eligibilityWorkspace = createStarterBrainWorkspace();
const eligibilityBehavior = eligibilityWorkspace.packages[0].contents.behaviors[0].value;
eligibilityBehavior.followup_scope = "confirm.help";
eligibilityBehavior.requires_values = [{ namespace: "context", path: "device.ready", value: true }];
eligibilityBehavior.forbidden_values = [{ namespace: "author", path: "device.disabled", value: true }];
eligibilityBehavior.repair_continuation_candidate = true;
eligibilityBehavior.repeat_same_input_after = 3;
eligibilityBehavior.repeat_same_meaning_after = 4;
const eligibilitySource = packageSnapshotDocument(eligibilityWorkspace.packages[0]);
const eligibilitySourceBehavior = eligibilitySource.contents.behaviors[0].value;
assert.equal(eligibilitySourceBehavior.followup_scope, "confirm.help");
assert.deepEqual(eligibilitySourceBehavior.requires_values, [{ namespace: "context", path: "device.ready", value: true }]);
assert.deepEqual(eligibilitySourceBehavior.forbidden_values, [{ namespace: "author", path: "device.disabled", value: true }]);
assert.equal(eligibilitySourceBehavior.repair_continuation_candidate, true);
assert.equal(eligibilitySourceBehavior.repeat_same_input_after, 3);
assert.equal(eligibilitySourceBehavior.repeat_same_meaning_after, 4);

const authorNumberWorkspace = createStarterStudioWorkspace();
authorNumberWorkspace.projects[0].bots[0].settings.conversation.author_numbers = [{ path: "trust", default: 5, min: 0, max: 10 }];
const authorNumberRoundTrip = studioWorkspaceFromText(studioWorkspaceToText(authorNumberWorkspace));
assert.ok(!("author_numbers" in authorNumberRoundTrip.settings.conversation));
assert.deepEqual(authorNumberRoundTrip.projects[0].bots[0].settings.conversation.author_numbers, authorNumberWorkspace.projects[0].bots[0].settings.conversation.author_numbers);
const overlappingAuthorState = JSON.parse(studioWorkspaceToText(authorNumberWorkspace));
overlappingAuthorState.projects[0].bots[0].settings.conversation.author_numbers = [
  { path: "score", default: 0, min: 0, max: 10 },
  { path: "score.value", default: 0, min: 0, max: 10 },
];
assert.throws(() => studioWorkspaceFromText(JSON.stringify(overlappingAuthorState)), /cannot overlap as parent and child/u);

const groupingWorkspace = createStarterBrainWorkspace();
const row = groupingWorkspace.packages[0].contents.behaviors[0];
row.value.topic = "support.billing";
row.value.responses[0].opens_followup = { id: "followup.payment", ttl: 2, refresh_if_same: false };
assert.equal(groupBehaviorRows(groupingWorkspace.packages[0].contents.behaviors, "topic")[0].label, "support.billing");
assert.equal(groupBehaviorRows(groupingWorkspace.packages[0].contents.behaviors, "followup")[0].label, "followup.payment");

const appSource = readFileSync(new URL("../apps/studio/src/App.tsx", import.meta.url), "utf8");
const managementSource = readFileSync(new URL("../apps/studio/src/studio-management-views.tsx", import.meta.url), "utf8");
const contentSource = readFileSync(new URL("../apps/studio/src/studio-content-views.tsx", import.meta.url), "utf8");
const navigationSource = readFileSync(new URL("../apps/studio/src/studio-navigation.tsx", import.meta.url), "utf8");
const behaviorSource = readFileSync(new URL("../apps/studio/src/studio-behavior-views.tsx", import.meta.url), "utf8");
const capabilitySource = readFileSync(new URL("../apps/studio/src/studio-capability-views.tsx", import.meta.url), "utf8");
const authoringSources = [
  appSource,
  behaviorSource,
  capabilitySource,
  contentSource,
].join("\n");
for (const marker of ["Create behavior", "Create capability", "Create asset"]) assert.ok(authoringSources.includes(marker), `missing transactional authoring marker: ${marker}`);
assert.doesNotMatch(authoringSources, /Changes stay in this modal until validation passes and you save\./u, "Authoring modal footers must not place descriptions beside their actions");
assert.ok(behaviorSource.includes('Delete fallback behavior</button>}<span className="footer-spacer"'), "Fallback Behavior removal must stay left of the footer spacer");
assert.ok(behaviorSource.includes('Delete behavior</button>}<span className="footer-spacer"'), "Behavior removal must stay left of the footer spacer");
assert.ok(managementSource.includes("ValidationErrors errors={errors}"), "management modals must show validation before Save");
assert.ok(managementSource.includes("validateProjectForm") && managementSource.includes("validateBotForm") && managementSource.includes("validatePackageForm"), "important management forms must validate local drafts before commit");
assert.match(capabilitySource, /createCapability\(""\)/u, "New Capability must start with an empty authored identity rather than a valid placeholder value");
assert.match(capabilitySource, /capability\.contract\.version = ""/u, "New Capability version must be authored rather than silently defaulted");
assert.match(capabilitySource, /placeholder="host\.calendar\.create"/u, "New Capability ID guidance must be a placeholder rather than source data");
assert.match(capabilitySource, /disabled=\{props\.saveBlocked \|\| Boolean\(identityError\) \|\| !idDraft\.trim\(\) \|\| !versionDraft\.trim\(\)\}/u, "Create capability must remain blocked until the authored identity is valid");
assert.match(capabilitySource, /Remove capability/u, "Capability editor must expose removal inside its modal footer");
assert.doesNotMatch(capabilitySource, /Runtime admission remains canonical Rust\./u, "Capability footer must not keep explanatory text beside its actions");
assert.doesNotMatch(managementSource, /LanguageCatalogEditor|settings\.languages/u, "Settings must not own a second language catalog");
assert.match(managementSource, /<strong>Bot disabled\.<\/strong> Missing Language\/Matcher Profile pair/u, "a disabled Bot Overview must name missing Language/Matcher Profile pairs");
assert.match(contentSource, /<strong>Package disabled\.<\/strong> Missing Language\/Matcher Profile pair/u, "a disabled Package Overview must name missing Language/Matcher Profile pairs");
assert.match(appSource, /overviewOnly=\{missingMatcherLanguages\.length > 0\}/u, "missing Language/Matcher Profile pairs must collapse contextual navigation to Overview");
assert.match(navigationSource, /props\.overviewOnly[\s\S]*\? \[\[props\.kind === "bot" \? "bot" : "package-overview", "Overview"\]\]/u, "Overview-only navigation must apply to both Bots and Packages");

console.log("PASS atomic behavior/meaning/response rename with dependency-aware reference rewrites");
console.log("PASS atomic package/capability identity commits rewrite dependent references and reject unsafe/colliding identity");
console.log("PASS safe capability deletion cascades local bindings/policies and blocks external dependents");

const teachBase = createStarterBrainWorkspace();
const teachBehavior = teachBase.packages[0].contents.behaviors[0].value;
const teachResponse = teachBehavior.responses[0];
const firstText = teachResponse.texts[0].variants[0];
assert.deepEqual(teachResponseTarget(teachBase, teachBehavior.id, firstText, "en-US"), {
  behaviorId: teachBehavior.id, responseId: teachResponse.id, canReplace: true,
});
assert.equal(teachResponseTarget(teachBase, "external.behavior", firstText, "en-US"), null);
const taughtVariation = teachConversation(teachBase, {
  action: "variation", input: "hello", answer: "Greetings, traveler!",
  language: "en-US", behaviorId: teachBehavior.id, responseId: teachResponse.id,
});
assert.equal(taughtVariation.packages[0].contents.behaviors[0].value.responses[0].texts[0].variants.at(-1), "Greetings, traveler!");
assert.equal(teachBase.packages[0].contents.behaviors[0].value.responses[0].texts[0].variants.includes("Greetings, traveler!"), false, "draft operations must not mutate the accepted source");
assert.throws(() => teachConversation(taughtVariation, {
  action: "variation", input: "hello", answer: "Greetings, traveler!",
  language: "en-US", behaviorId: teachBehavior.id, responseId: teachResponse.id,
}), /already a variant/u);
const taughtReplacement = teachConversation(teachBase, {
  action: "replace", input: "hello", answer: "Hello, explorer!",
  previousReply: firstText, language: "en-US",
  behaviorId: teachBehavior.id, responseId: teachResponse.id,
});
assert.equal(taughtReplacement.packages[0].contents.behaviors[0].value.responses[0].texts[0].variants[0], "Hello, explorer!");
assert.throws(() => teachConversation(teachBase, {
  action: "replace", input: "hello", answer: "Hello, explorer!",
  previousReply: "wrong runtime result", language: "en-US",
  behaviorId: teachBehavior.id, responseId: teachResponse.id,
}), /no longer matches/u);
const taughtTopic = teachConversation(teachBase, {
  action: "new", input: "Where is the marketplace?", answer: "Across the bridge.",
  language: "en-US", topic: "village.market",
});
const latestMeaning = taughtTopic.packages[0].contents.meanings.at(-1).value;
const latestBehavior = taughtTopic.packages[0].contents.behaviors.at(-1).value;
assert.deepEqual(latestMeaning.samples, [{ language: "en-US", text: "Where is the marketplace?" }]);
assert.equal(latestBehavior.topic, "village.market");
assert.equal(latestBehavior.activates_topic, true);
assert.equal(latestBehavior.topic_scoped, false);
assert.equal(latestBehavior.responses[0].texts[0].variants[0], "Across the bridge.");
assert.throws(() => teachConversation(teachBase, {
  action: "new", input: "hi", answer: "hello", language: "zz-ZZ",
}), /Choose a language/u);
console.log("PASS Teach mutations are transactional and write canonical localized responses and topics");

console.log("PASS safe behavior deletion blocks dependent bindings/tests and removes an unreferenced pair atomically");
console.log("PASS safe response deletion preserves at least one response and blocks referenced responses");
console.log("PASS behavior follow-up, eligibility, repair-candidate, and repeat-threshold fields serialize canonically");
console.log("PASS Bot-owned numeric memory persistence and overlap rejection");
console.log("PASS behavior grouping by topic/follow-up and author ID validation");
console.log("PASS important Studio object forms are transactional drafts with in-modal validation and explicit Save/Create commit");
console.log("PASS Matcher-Profile-disabled Bots and Packages expose diagnostic Overview-only UI");
