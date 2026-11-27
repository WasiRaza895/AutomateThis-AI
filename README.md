# AutomateThis AI

AutomateThis AI scans a company’s public website and ranks up to three quick wins. Each recommendation links to supporting pages and includes a 3D workflow, a no-code stack, a recipe, an AI prompt, risk controls, and Markdown and JSON exports. The original browser-only manual planner is available under **Manual planner**.

## Why This Exists

Most people know AI automation is useful, but they do not know what to automate first. This project turns a messy workday description into a concrete plan that can be built with Zapier, Make, n8n, Airtable, Google Sheets, Notion, Slack, Gmail, or similar tools.

## Features

- Plain-English workflow analysis
- Automation opportunity scoring
- Monthly time and value estimate
- Recommended no-code tool stack
- Step-by-step workflow recipe
- Reusable AI prompt for implementation
- Risk controls for approval, privacy, and quality
- Markdown copy export
- JSON blueprint export
- Website scan and optional Gemini-assisted analysis
- Editable savings estimates in the website audit
- Browser-only manual planner

## Quick Start

With Node.js 22 or newer, run these commands from the repository root.

```bash
npm ci
npm start
```

Open `http://127.0.0.1:8780`, enter a public company website, or choose **Try a sample audit**. Change the estimated runs and minutes saved for any blueprint to model its impact. Open `planner.html` directly for the original manual planner.

### Gemini setup

Copy `.env.example` to `.env` and set `GEMINI_API_KEY` on the server. Without a key, the website scan uses built-in rules grounded in the pages it read. The report identifies its analysis mode. Set `GEMINI_MODEL` to choose another Gemini model that supports structured output.

### Hosting

The website audit calls the Node.js server in `server.mjs`. Set `HOST=0.0.0.0` and pass your hosting provider’s `PORT` when deploying it. A static host such as GitHub Pages can serve `planner.html` and its assets.

### Tests

```bash
npm test
```

## LinkedIn Launch Post

```text
I built AutomateThis AI.

Describe a repetitive business workflow and it generates:
- the best automation angle
- tools to use
- estimated monthly time saved
- AI prompt
- step-by-step no-code build plan
- risk controls

Comment "AUTOMATE" and I will send you the GitHub repo.
```

## Best Use Cases

- Lead follow-up automation
- Meeting notes to action items
- Customer support triage
- Daily admin command centers
- Document to workflow extraction
- Client intake workflows
- Reporting and spreadsheet cleanup

## Roadmap

- Add another model provider
- Add workflow diagram export
- Add saved blueprint history
- Add n8n template generation
- Add Zapier and Make scenario templates
- Add GitHub issue export for community-submitted workflows

## Privacy

The manual planner processes workflow descriptions in your browser. The website audit fetches up to eight public pages on the supplied domain. When Gemini is configured, it receives excerpts from those pages for analysis. API keys are configured on the server. Estimates use values you enter and stay in the browser until you export them.

## License

MIT
