const form = document.querySelector("#plannerForm");
const workflowInput = document.querySelector("#workflow");
const sampleButton = document.querySelector("#sampleButton");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");

const output = {
  heroSavings: document.querySelector("#heroSavings"),
  score: document.querySelector("#score"),
  hoursSaved: document.querySelector("#hoursSaved"),
  monthlyValue: document.querySelector("#monthlyValue"),
  bestAutomation: document.querySelector("#bestAutomation"),
  stackList: document.querySelector("#stackList"),
  recipeList: document.querySelector("#recipeList"),
  promptBlock: document.querySelector("#promptBlock"),
  riskList: document.querySelector("#riskList"),
  linkedinHook: document.querySelector("#linkedinHook")
};

const sampleWorkflow =
  "Every weekday I check Gmail and LinkedIn for new leads, copy their name, company, and message into Google Sheets, research the company website, write a custom follow-up, and remind myself after three days if they do not reply.";

const patterns = [
  {
    name: "Lead Follow-Up Commander",
    terms: ["lead", "prospect", "follow", "reply", "dm", "linkedin", "sales"],
    automation:
      "Lead follow-up assistant that captures new leads, enriches context, drafts personalized replies, and schedules nudges until the conversation is closed.",
    stack: ["Gmail/LinkedIn", "Google Sheets or Airtable", "Make or n8n", "OpenAI-compatible LLM", "Slack/Email alerts"],
    recipe: [
      "Trigger when a new lead email, form response, or CRM row appears.",
      "Extract name, company, source, message intent, and urgency into a structured record.",
      "Research public company context or use the provided notes field for personalization.",
      "Generate a short reply, a fallback follow-up, and a next-step recommendation.",
      "Send the draft for human approval, then schedule follow-up reminders."
    ],
    risks: ["Require human approval before sending", "Store lead source for consent tracking", "Log every outbound message"]
  },
  {
    name: "Meeting-to-Action Commander",
    terms: ["meeting", "transcript", "zoom", "call", "notes", "action", "deadline"],
    automation:
      "Meeting agent that turns notes and transcripts into owners, deadlines, follow-ups, project tasks, and reminder messages.",
    stack: ["Zoom/Meet transcript", "Notion or Asana", "n8n", "LLM extraction prompt", "Calendar reminders"],
    recipe: [
      "Trigger when a meeting transcript or notes document is added.",
      "Extract decisions, action items, owners, deadlines, and blockers.",
      "Create tasks in the team workspace with priority and due date.",
      "Draft follow-up email with decisions and next steps.",
      "Send reminders before deadlines and summarize overdue items."
    ],
    risks: ["Confirm action owners", "Avoid sharing confidential transcript details", "Keep original notes linked"]
  },
  {
    name: "Support Triage Commander",
    terms: ["support", "ticket", "customer", "complaint", "refund", "angry", "issue"],
    automation:
      "Support triage assistant that classifies customer messages, drafts replies, flags churn risk, and escalates urgent cases.",
    stack: ["Helpdesk or Gmail", "Airtable", "Zapier/Make", "LLM classifier", "Slack escalation"],
    recipe: [
      "Trigger when a new support message arrives.",
      "Classify sentiment, issue type, urgency, and refund risk.",
      "Draft a reply using the brand tone and known policies.",
      "Escalate angry, legal, billing, or high-value customer cases.",
      "Track repeated issues so operations can fix the root cause."
    ],
    risks: ["Do not auto-issue refunds", "Escalate legal or safety issues", "Use approved policy snippets only"]
  },
  {
    name: "Admin Workload Commander",
    terms: ["task", "todo", "calendar", "admin", "reminder", "schedule", "busy"],
    automation:
      "Daily command center that prioritizes tasks, groups repetitive admin work, and creates reminders before work slips.",
    stack: ["Google Calendar", "Todoist/Notion", "Google Sheets", "n8n", "Email digest"],
    recipe: [
      "Trigger every morning and when new tasks are added.",
      "Collect calendar events, task lists, deadlines, and unread admin items.",
      "Rank work by urgency, value, and time sensitivity.",
      "Create a realistic day plan with reminders and batch windows.",
      "Send a morning brief and an end-of-day unfinished work summary."
    ],
    risks: ["Let users override priorities", "Do not delete tasks automatically", "Keep private calendar data local when possible"]
  },
  {
    name: "Document-to-Workflow Commander",
    terms: ["document", "pdf", "sop", "contract", "policy", "manual", "process"],
    automation:
      "Document parser that converts SOPs, contracts, and PDFs into executable checklists, reminders, approvals, and automation maps.",
    stack: ["Google Drive", "OCR/PDF parser", "Airtable", "Make", "LLM workflow extractor"],
    recipe: [
      "Trigger when a document is uploaded to a watched folder.",
      "Extract obligations, steps, dates, approvals, and responsible roles.",
      "Turn repeated steps into a checklist template.",
      "Recommend automation triggers for each manual handoff.",
      "Create reminders for deadlines and approval gates."
    ],
    risks: ["Mark legal output as draft", "Require review before deadlines are created", "Preserve source citations"]
  }
];

let currentPlan = null;

function selectedValues(name) {
  return [...form.querySelectorAll(`[name="${name}"]:checked`)].map((item) => item.value);
}

function matchPattern(text) {
  const normalized = text.toLowerCase();
  const ranked = patterns
    .map((pattern) => ({
      ...pattern,
      hits: pattern.terms.filter((term) => normalized.includes(term)).length
    }))
    .sort((a, b) => b.hits - a.hits);

  return ranked[0].hits > 0 ? ranked[0] : patterns[3];
}

function createPlan() {
  const text = workflowInput.value.trim();
  const role = document.querySelector("#role").value;
  const runs = Number(document.querySelector("#runs").value || 1);
  const minutes = Number(document.querySelector("#minutes").value || 1);
  const rate = Number(document.querySelector("#rate").value || 1);
  const goal = selectedValues("goal")[0];
  const tools = selectedValues("tools");
  const pattern = matchPattern(text);
  const weeklyHours = (runs * minutes) / 60;
  const monthlyHours = weeklyHours * 4.33;
  const automationCoverage = Math.min(0.82, 0.42 + pattern.hits * 0.08 + tools.length * 0.025);
  const savedHours = monthlyHours * automationCoverage;
  const monthlyValue = Math.round(savedHours * rate);
  const score = Math.min(96, Math.round(55 + pattern.hits * 7 + Math.min(savedHours, 25)));
  const toolStack = [...new Set([...pattern.stack, ...tools])];

  const prompt = `You are an AI automation analyst for a ${role}.
Goal: ${goal}.
Workflow: ${text}

Return JSON with:
1. trigger
2. data_to_extract
3. decision_rules
4. draft_outputs
5. human_approval_points
6. automations_to_build
7. risks_and_controls

Write concise, practical steps that a no-code builder can implement in Zapier, Make, or n8n.`;

  return {
    project: pattern.name,
    automation: pattern.automation,
    role,
    goal,
    sourceWorkflow: text,
    runsPerWeek: runs,
    minutesPerRun: minutes,
    hourlyValue: rate,
    score,
    savedHours: Number(savedHours.toFixed(1)),
    monthlyValue,
    stack: toolStack,
    recipe: pattern.recipe,
    risks: pattern.risks,
    prompt,
    linkedinHook: `I built AutomateThis AI, a tool that turns messy ${role.toLowerCase()} workflows into no-code automation plans. This one can save about ${savedHours.toFixed(
      1
    )} hours/month by automating: ${pattern.automation}`
  };
}

function fillList(node, items) {
  node.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    node.appendChild(li);
  });
}

function renderPlan(plan) {
  output.heroSavings.textContent = `${plan.savedHours}h/mo`;
  output.score.textContent = plan.score;
  output.hoursSaved.textContent = `${plan.savedHours}/mo`;
  output.monthlyValue.textContent = `$${plan.monthlyValue.toLocaleString()}`;
  output.bestAutomation.textContent = plan.automation;
  fillList(output.stackList, plan.stack);
  fillList(output.recipeList, plan.recipe);
  output.promptBlock.textContent = plan.prompt;
  fillList(output.riskList, plan.risks);
  output.linkedinHook.textContent = plan.linkedinHook;
}

function toMarkdown(plan) {
  return `# ${plan.project}

## Automation Opportunity
${plan.automation}

## ROI Estimate
- Automation score: ${plan.score}/100
- Time saved: ${plan.savedHours} hours/month
- Estimated monthly value: $${plan.monthlyValue.toLocaleString()}

## Recommended Stack
${plan.stack.map((item) => `- ${item}`).join("\n")}

## Workflow Recipe
${plan.recipe.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## AI Prompt
\`\`\`text
${plan.prompt}
\`\`\`

## Risk Controls
${plan.risks.map((item) => `- ${item}`).join("\n")}

## LinkedIn Hook
${plan.linkedinHook}
`;
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  currentPlan = createPlan();
  renderPlan(currentPlan);
});

sampleButton.addEventListener("click", () => {
  workflowInput.value = sampleWorkflow;
  form.requestSubmit();
});

copyButton.addEventListener("click", async () => {
  if (!currentPlan) currentPlan = createPlan();
  await navigator.clipboard.writeText(toMarkdown(currentPlan));
  copyButton.textContent = "Copied";
  window.setTimeout(() => {
    copyButton.textContent = "Copy Markdown";
  }, 1400);
});

downloadButton.addEventListener("click", () => {
  if (!currentPlan) currentPlan = createPlan();
  const blob = new Blob([JSON.stringify(currentPlan, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "automation-blueprint.json";
  anchor.click();
  URL.revokeObjectURL(url);
});

workflowInput.value = sampleWorkflow;
currentPlan = createPlan();
renderPlan(currentPlan);
