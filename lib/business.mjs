export const profiles = [
  {
    id: "payments", label: "Payments and digital financial services",
    identity: /\b(?:send money|money transfers?|debit cards?|virtual cards?|digital wallet|payment processing|merchant payments?|money account|online banking|payment platform)\b/gi,
    journeys: [
      {
        category: "payment-disputes", group: "support", title: "Prepare payment dispute intake",
        signal: /\b(?:chargebacks?|dispute (?:a|your) (?:payment|transaction|charge)|transaction disputes?|complaints? (?:and|&) disputes?|unauthorized transactions?)\b/i,
        reason: "Turn the published dispute instructions into a guided intake checklist so support staff receive more complete cases.",
        steps: ["A customer opens the dispute intake form.", "Use the approved checklist to identify the case type and request only missing, non-sensitive details.", "A support specialist reviews the case and decides how to handle it.", "Save the checklist and route the case to the dispute queue."],
        stack: ["Helpdesk form", "Approved dispute checklist", "Helpdesk routing rules"],
        risk: "Keep card numbers and transaction records out of the AI prompt. Reserve refunds, eligibility, and dispute decisions for staff.",
        effort: 2, impact: 5, aiFit: 4,
      },
      {
        category: "card-onboarding", group: "onboarding", title: "Draft a new card setup checklist",
        signal: /\b(?:debit cards?|virtual cards?|order (?:a|your) card|activate (?:a|your) card)\b/i,
        reason: "Card setup is a public product journey. Generate a short checklist from approved setup instructions for customers asking how to start.",
        steps: ["A customer requests guidance on getting or setting up a card.", "Select verified setup instructions for their card type and draft the next steps.", "Support checks any account-specific question and verifies the instructions.", "Save the checklist as a support draft or approved help article."],
        stack: ["Approved card help articles", "Helpdesk macros", "AI draft assistant"],
        risk: "Never ask users for card numbers, PINs, or identity documents in the workflow.",
        effort: 2, impact: 4, aiFit: 4,
      },
      {
        category: "transfer-guidance", group: "faq", title: "Draft money transfer guidance",
        signal: /\b(?:send money|money transfers?|international transfers?|receive payments?|get paid|send and receive)\b/i,
        reason: "Published transfer options give support staff a repeatable source for explaining supported payment routes and next steps.",
        steps: ["A customer asks how to send or receive money.", "Retrieve the approved help article for the transfer route and draft an answer with its source.", "A reviewer checks exceptions, current limits, and any account-specific detail.", "Save the answer as a draft in the service inbox."],
        stack: ["Transfer help articles", "Support inbox", "AI draft assistant"],
        risk: "Avoid initiating transactions or guessing fees, limits, and transfer status.",
        effort: 1, impact: 4, aiFit: 4,
      },
    ],
  },
  {
    id: "commerce", label: "Online retail",
    identity: /\b(?:shop (?:all|online|now|our|[a-z-]+ bags?)|add to (?:cart|bag)|order tracking|free shipping|returns? policy|product collections?)\b/gi,
    journeys: [
      {
        category: "order-status", group: "support", title: "Draft order and shipping updates",
        signal: /\b(?:order tracking|track (?:my|your|an) order|shipping(?: policy| and delivery| & delivery| information)?|delivery times?)\b/i,
        reason: "Published shipping information can guide routine order-status replies, using verified tracking data once the store connects it.",
        steps: ["A customer asks about delivery or tracking.", "Look up the status from the approved order system and pair it with the published shipping guidance.", "Route delayed, missing, or conflicting orders to a teammate.", "Save a status reply and link to the verified tracking page."],
        stack: ["Store order system", "Carrier tracking", "Support inbox"],
        risk: "Verify the requester before exposing order details and use only carrier data for delivery promises.",
        effort: 1, impact: 5, aiFit: 4,
      },
      {
        category: "returns-intake", group: "returns", title: "Collect return and exchange details",
        signal: /\b(?:returns? and exchanges?|returns? & exchanges?|returns? policy|returns? portal|start a return|return label|return or exchange)\b/i,
        reason: "The store publishes a returns path. A guided checklist can collect the order reference, item, and reason before staff review the request.",
        steps: ["A customer requests a return or exchange.", "Collect the minimum order and item details and show the matching published policy.", "A teammate checks exceptions and approves any refund or exchange.", "Route the case with its checklist to the returns queue."],
        stack: ["Returns form", "Store order system", "Helpdesk"],
        risk: "Require review for eligibility exceptions and refunds. Avoid handling payment card data.",
        effort: 2, impact: 5, aiFit: 4,
      },
      {
        category: "stock-alerts", group: "inventory", title: "Send verified restock alerts",
        signal: /\b(?:out of stock|sold out|notify me|back in stock|restock(?:ed)?)\b/i,
        reason: "Stock availability is visible on the site. An opt-in alert can inform shoppers when the exact item or variant returns.",
        steps: ["A shopper opts in for an unavailable item.", "Watch the authorized inventory source for that exact variant to become available.", "Check stale stock, duplicate alerts, and unsubscribe requests.", "Queue a one-time restock message with the product link."],
        stack: ["Store inventory events", "Opt-in form", "Email platform"],
        risk: "Send only to subscribers who asked for the alert and prevent duplicate notices.",
        effort: 2, impact: 4, aiFit: 3,
      },
    ],
  },
  {
    id: "software", label: "Software and online tools",
    identity: /\b(?:project management software|software for|app for teams|collaboration software|software platform|free trial|product tour|SaaS|task management|software subscription|form builder|survey software|online surveys?)\b/gi,
    journeys: [
      {
        category: "trial-activation", group: "onboarding", title: "Guide new users to their first milestone",
        signal: /\b(?:free trial|try (?:it|for) free|get started for free|sign up (?:for free|free)|start (?:a|your) trial|first (?:project|form|survey)|create your (?:form|survey)|new project)\b/i,
        reason: "The site describes a trial or a first project. Build a short checklist around the first useful action customers can take.",
        steps: ["A trial user signs up.", "Choose the approved first-use checklist and draft one next step based on what the user has completed.", "A team member reviews edge cases and approves coaching messages.", "Show the checklist in the workspace or save a follow-up draft."],
        stack: ["Product signup event", "Approved onboarding checklist", "In-app messaging or email drafts"],
        risk: "Use only consented product signals and stop reminders after completion or opt-out.",
        effort: 1, impact: 5, aiFit: 4,
      },
      {
        category: "software-setup", group: "support", title: "Draft answers to product setup questions",
        signal: /\b(?:help (?:center|guides?)|documentation|knowledge base|support guides?|how to (?:set up|create|use)|tutorials?|how-to guides?)\b/i,
        reason: "The product publishes support or setup material. Convert common questions into source-linked draft answers for the support team.",
        steps: ["A new customer asks a setup question.", "Find the relevant approved product guide and draft the steps with a source link.", "A teammate verifies the instructions and handles tool access or account cases.", "Save the draft in the support inbox."],
        stack: ["Product documentation", "Helpdesk", "AI draft assistant"],
        risk: "Escalate any permission, billing, or account-specific issue to support.",
        effort: 2, impact: 4, aiFit: 5,
      },
      {
        category: "plan-guidance", group: "faq", title: "Draft answers about plan options",
        signal: /\b(?:plans? and pricing|pricing plans?|billed (?:annually|monthly)|per user per month|per month|compare plans)\b/i,
        reason: "The site publishes plan or pricing information. Use it to draft answers to common plan questions and flag unclear cases.",
        steps: ["A lead asks about plans, billing options, or supported capacity.", "Retrieve the current public plan information and draft a source-linked comparison.", "Have sales staff verify prices, terms, and exceptions.", "Save the draft in the sales or support inbox."],
        stack: ["Published pricing page", "Support or sales inbox", "AI draft assistant"],
        risk: "Keep discounts, promises, and contract terms under human approval.",
        effort: 1, impact: 4, aiFit: 4,
      },
    ],
  },
  {
    id: "services", label: "Client services",
    identity: /\b(?:web design|design studio|marketing agency|professional services|creative agency|design agency|consulting services|client projects?|project scope|request a quote)\b/gi,
    journeys: [],
  },
];

const productPage = /\/(?:about(?:-us)?|products?|services?|solutions?|apps?|features?|pricing|plans?|shop|collections?)(?:[/-]|$)/i;
const secondaryPage = /\/(?:blogs?|news|press|polic(?:y|ies)|legal|careers?|terms|privacy|faq|support|contact|templates?)(?:[/-]|$)|(?:^|[/-])(?:gift-cards?|terms-conditions|campaign|lucky-draw)(?:[/-]|$)/i;

function businessEvidence(page, pattern) {
  const text = [page.description, ...(page.snippets ?? []), ...(page.headings ?? []), page.title]
    .filter((value) => value.length >= 23 && value.length <= 360);
  const matches = text.map((excerpt) => ({ excerpt, count: new Set([...excerpt.matchAll(pattern)].map(([word]) => word.toLowerCase())).size }))
    .filter(({ count }) => count > 0)
    .sort((a, b) => b.count - a.count);
  return matches[0]?.excerpt;
}

export function coreBusiness(pages) {
  const ranked = profiles.map((profile) => {
    const scores = pages.map((page, index) => {
      const path = new URL(page.url).pathname;
      const prominent = [page.title, page.description, ...(page.headings ?? [])].join(" ");
      const prominentHits = new Set([...prominent.matchAll(profile.identity)].map(([term]) => term.toLowerCase()));
      const bodyHits = new Set([...page.content.matchAll(profile.identity)].map(([term]) => term.toLowerCase()));
      const weight = index === 0 ? 4 : secondaryPage.test(path) ? 0.25 : productPage.test(path) ? 2 : 1;
      return { index, score: weight * (Math.min(prominentHits.size, 4) * 3 + Math.min(bodyHits.size, 3)) };
    }).sort((a, b) => b.score - a.score);
    return { profile, total: scores.slice(0, 3).reduce((sum, { score }) => sum + score, 0), source: scores[0].index };
  }).sort((a, b) => b.total - a.total);
  const best = ranked[0];
  return best.total >= 6 && best.total >= ranked[1].total * 1.2
    ? { profile: best.profile, source: best.source, excerpt: businessEvidence(pages[best.source], best.profile.identity) }
    : { profile: null, source: 0 };
}
