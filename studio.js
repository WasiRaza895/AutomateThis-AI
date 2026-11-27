const byId = (id) => document.getElementById(id);
const state = { audit: null, selected: null, busy: false, estimates: new Map() };
const metrics = [byId("estimate-runs"), byId("estimate-minutes"), byId("estimate-rate")];
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const providerNames = { gemini: "Gemini", claude: "Claude", openai: "OpenAI" };
let motionEnabled = !reducedMotion.matches;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function notice(id, message, error = false) {
  const node = byId(id);
  node.hidden = !message;
  node.textContent = message;
  node.classList.toggle("error", error);
}

function focusSection(sectionId, headingId) {
  byId(headingId).focus({ preventScroll: true });
  byId(sectionId).scrollIntoView({ behavior: motionEnabled ? "smooth" : "auto" });
}

function sourceItem(source, detail = false) {
  const item = element("li");
  if (state.audit.mode === "sample") {
    item.append(element("strong", "", source.title));
  } else {
    const link = element("a", "source-link", source.title);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    item.append(link);
  }
  if (detail) item.append(element("p", "", source.excerpt));
  return item;
}

function effortLabel(effort) {
  if (effort <= 2) return "Low effort";
  if (effort === 3) return "Medium effort";
  return "Higher effort";
}

function renderCards() {
  const cards = state.audit.opportunities.map((item, index) => {
    const button = element("button", "opportunity");
    button.type = "button";
    button.dataset.opportunity = item.id;
    button.setAttribute("aria-pressed", String(state.selected?.id === item.id));
    const top = element("span", "opportunity-top");
    top.append(element("span", "rank", String(index + 1)), element("span", "effort", effortLabel(item.effort)));
    button.append(top, element("strong", "", item.title), element("span", "opportunity-reason", item.reason),
      element("small", "", `${item.score}/100 priority · ${item.evidence.length} source${item.evidence.length === 1 ? "" : "s"}${item.origin === "ai" ? " · AI-assisted" : ""}`));
    button.addEventListener("click", () => showBlueprint(item, true));
    return button;
  });
  byId("opportunities").replaceChildren(...cards);
}

function selectStep(index) {
  for (const node of byId("flow-track").children) {
    node.setAttribute("aria-pressed", String(Number(node.dataset.step) === index));
  }
  const step = state.selected.steps[index];
  byId("step-stage").textContent = step.label;
  byId("step-description").textContent = step.detail;
}

function showBlueprint(item, focus = false) {
  state.selected = item;
  for (const button of byId("opportunities").children) {
    button.setAttribute("aria-pressed", String(button.dataset.opportunity === item.id));
  }
  byId("blueprint").hidden = false;
  byId("blueprint-title").textContent = item.title;
  byId("blueprint-reason").textContent = item.reason;
  byId("blueprint-evidence").replaceChildren(...item.evidence.map((source) => sourceItem(source, true)));
  byId("blueprint-stack").replaceChildren(...item.stack.map((tool) => element("li", "", tool)));
  byId("blueprint-risks").replaceChildren(...item.risks.map((risk) => element("li", "", risk)));
  byId("recipe").replaceChildren(...item.steps.map((step) => {
    const line = element("li");
    line.append(element("strong", "", `${step.label} `), document.createTextNode(step.detail));
    return line;
  }));
  byId("blueprint-prompt").textContent = item.prompt;
  byId("blueprint-hook").textContent = item.linkedinHook;
  byId("flow-track").replaceChildren(...item.steps.map((step, index) => {
    const node = element("button", "flow-node");
    node.type = "button";
    node.dataset.step = index;
    const stepNumber = element("span", "", `Step ${index + 1}`);
    node.append(stepNumber, element("strong", "", step.label));
    node.addEventListener("click", () => selectStep(index));
    return node;
  }));
  selectStep(0);
  const values = state.estimates.get(item.id) ?? ["", "", ""];
  metrics.forEach((input, index) => { input.value = values[index]; });
  updateEstimate();
  notice("export-status", "");
  if (focus) focusSection("blueprint", "blueprint-title");
}

function displayAudit(audit, focus) {
  state.audit = audit;
  state.selected = audit.opportunities[0] ?? null;
  state.estimates.clear();
  byId("results").hidden = false;
  const providerName = providerNames[audit.analysisProvider];
  const mode = { sample: "Sample audit", rules: "Website audit · Built-in rules" };
  byId("result-mode").textContent = mode[audit.mode] ?? `Website audit · ${providerNames[audit.mode]} assisted`;
  byId("results-title").textContent = audit.company;
  byId("business-label").textContent = audit.business?.label ?? "Business type unclear from the pages read";
  byId("company-summary").textContent = audit.summary;
  byId("business-source").replaceChildren(...(audit.business ? [sourceItem(audit.business.source)] : []));
  byId("source-count").textContent = `${audit.pages.length} ${audit.mode === "sample" ? "sample" : "public"} page${audit.pages.length === 1 ? "" : "s"}`;
  byId("source-list").replaceChildren(...audit.pages.map((source) => sourceItem(source)));
  const count = audit.opportunities.length;
  const ranking = count ? `${count} ${count === 1 ? "opportunity" : "opportunities"} ranked by fit with the business, ease, impact, and AI fit.` : "The scanned pages didn’t support a specific automation. Try a more detailed service page or use the manual planner.";
  const modelIssues = {
    access: "Check your API key and model access.",
    limit: "Check your provider’s API quota or billing.",
    timeout: "The model took too long to respond.",
    evidence: "The model could not support its ideas with quotes from the pages read.",
    unavailable: "The model could not complete this scan.",
  };
  const mixed = providerName && audit.mode !== "rules" && audit.opportunities.some((item) => item.origin === "rules");
  let message = ranking;
  if (audit.modelIssue) message = `${providerName} analysis fell back to built-in rules. ${modelIssues[audit.modelIssue]} ${ranking}`;
  else if (mixed) message = `${providerName} suggestions are marked AI-assisted. Built-in analysis filled the remaining spots. ${ranking}`;
  notice("result-notice", message);
  renderCards();
  if (state.selected) showBlueprint(state.selected);
  else byId("blueprint").hidden = true;
  if (focus) focusSection("results", "results-title");
}

async function loadAudit(url = null, focus = true, ai = null) {
  if (state.busy) return;
  state.busy = true;
  byId("scan-button").disabled = true;
  byId("sample-button").disabled = true;
  byId("website").readOnly = true;
  byId("ai-provider").disabled = true;
  byId("ai-key").disabled = true;
  if (url) notice("scan-status", ai ? `Reading public pages and preparing ${providerNames[ai.provider]} analysis…` : "Reading public pages to identify the business and its customer workflows…");
  else notice("scan-status", "");
  try {
    const response = await fetch(url ? "/api/audit" : "/api/sample", url ? {
      method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", body: JSON.stringify(ai ? { url, ai } : { url }),
    } : undefined);
    const audit = await response.json();
    if (!response.ok) throw new Error(audit.error ?? "Unable to finish this website scan.");
    notice("scan-status", url ? `Scan complete. Read ${audit.pages.length} public page${audit.pages.length === 1 ? "" : "s"}.` : "");
    displayAudit(audit, focus);
  } catch (error) {
    notice("scan-status", error instanceof SyntaxError ? "Start the AutomateThis AI server to run a website audit." : error.message, true);
  } finally {
    state.busy = false;
    byId("scan-button").disabled = false;
    byId("sample-button").disabled = false;
    byId("website").readOnly = false;
    byId("ai-provider").disabled = false;
    byId("ai-key").disabled = false;
  }
}

function estimate() {
  if (metrics.some((input) => !input.validity.valid) || !metrics[0].value || !metrics[1].value) return null;
  const [runs, minutes, rate] = metrics.map((input) => input.value ? Number(input.value) : null);
  const hours = runs * minutes * 4.33 / 60;
  return { runsPerWeek: runs, minutesSavedPerRun: minutes, hourlyValue: rate, hoursPerMonth: Number(hours.toFixed(1)), monthlyValue: rate === null ? null : Math.round(hours * rate) };
}

function updateEstimate() {
  const values = estimate();
  const message = values
    ? `Estimated ${values.hoursPerMonth} hours saved per month${values.monthlyValue === null ? "." : ` · $${values.monthlyValue.toLocaleString()} per month.`}`
    : "Enter runs and minutes to calculate an estimate.";
  byId("estimate-output").textContent = message;
}

function exportData() {
  return { company: state.audit.company, website: state.audit.domain, business: state.audit.business, analysisMode: state.audit.mode, ...state.selected, estimate: estimate() };
}

function markdown(data) {
  const estimateLine = data.estimate
    ? `${data.estimate.hoursPerMonth} hours/month${data.estimate.monthlyValue === null ? "" : ` · $${data.estimate.monthlyValue}/month`}, based on your inputs.`
    : "Add your runs per week and time saved to estimate the impact.";
  return [
    `# ${data.title}`, data.business ? `${data.company} · ${data.business.label}` : data.company, `## Why this fits\n${data.reason}`, `## Sources\n${data.evidence.map(({ title, url }) => `- ${title}${data.analysisMode === "sample" ? " (sample page)" : ` · ${url}`}`).join("\n")}`,
    `## Opportunity\n${data.score}/100 priority · ${effortLabel(data.effort)}\n${estimateLine}`,
    `## Recommended stack\n${data.stack.map((tool) => `- ${tool}`).join("\n")}`,
    `## Workflow recipe\n${data.steps.map((step, index) => `${index + 1}. ${step.label} — ${step.detail}`).join("\n")}`,
    `## Risk controls\n${data.risks.map((risk) => `- ${risk}`).join("\n")}`,
    `## AI prompt\n${data.prompt}`, `## LinkedIn hook\n${data.linkedinHook}`,
  ].join("\n\n");
}

function setMotion(enabled) {
  motionEnabled = enabled;
  document.body.classList.toggle("motion-off", !enabled);
  byId("motion-toggle").textContent = enabled ? "Pause motion" : "Resume motion";
  byId("motion-toggle").setAttribute("aria-pressed", String(!enabled));
  for (const id of ["cover", "flow-space"]) {
    byId(id).style.setProperty("--rx", "0deg");
    byId(id).style.setProperty("--ry", "0deg");
  }
}

for (const id of ["cover", "flow-space"]) {
  const panel = byId(id);
  panel.addEventListener("pointermove", (event) => {
    if (!motionEnabled || event.pointerType === "touch") return;
    const rect = panel.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - .5;
    const y = (event.clientY - rect.top) / rect.height - .5;
    panel.style.setProperty("--rx", `${-y * 12}deg`);
    panel.style.setProperty("--ry", `${x * 13}deg`);
  });
  panel.addEventListener("pointerleave", () => {
    panel.style.setProperty("--rx", "0deg");
    panel.style.setProperty("--ry", "0deg");
  });
}

function updateScanButton() {
  const apiKey = byId("ai-key").value.trim();
  const providerName = providerNames[byId("ai-provider").value];
  byId("scan-button").textContent = apiKey ? `Analyze with ${providerName}` : "Analyze website";
}

byId("ai-key").addEventListener("input", updateScanButton);
byId("ai-provider").addEventListener("change", () => {
  byId("ai-key").value = "";
  updateScanButton();
});
byId("audit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const url = byId("website").value.trim();
  if (!url || state.busy) return;
  const apiKey = byId("ai-key").value.trim();
  const provider = byId("ai-provider").value;
  byId("ai-key").value = "";
  updateScanButton();
  loadAudit(url, true, apiKey ? { provider, apiKey } : null);
});
byId("sample-button").addEventListener("click", () => loadAudit());
byId("motion-toggle").addEventListener("click", () => setMotion(!motionEnabled));
reducedMotion.addEventListener("change", (event) => setMotion(!event.matches));
for (const input of metrics) input.addEventListener("input", () => {
  state.estimates.set(state.selected.id, metrics.map((field) => field.value));
  updateEstimate();
});

byId("copy-blueprint").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(markdown(exportData()));
    notice("export-status", "Markdown copied.");
  } catch {
    notice("export-status", "Clipboard access is unavailable. You can still export JSON.", true);
  }
});
byId("export-blueprint").addEventListener("click", () => {
  const file = URL.createObjectURL(new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" }));
  const download = element("a");
  download.href = file;
  download.download = `automatethis-${state.selected.id}.json`;
  download.click();
  setTimeout(() => URL.revokeObjectURL(file), 1000);
  notice("export-status", "JSON export ready.");
});

setMotion(motionEnabled);
loadAudit(null, false);
