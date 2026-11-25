/**
 * The Privacy and Terms pages, in the owner's words (CONTENT.md). Words only.
 * Privacy says what the code does, nothing more: each sentence names the file that makes it true, in a comment.
 * If the code changes, change this file in the same pull request.
 * Terms have NOT been reviewed by a lawyer.
 */
export const LEGAL_UPDATED = "2026-11-24";

/** The address people write to. Set NEXT_PUBLIC_CONTACT_EMAIL at build time; until then the page shows a placeholder. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "[contact email]";

export type LegalLink = { text: string; href: string };
export type LegalSection = { id: string; heading: string; paragraphs: string[]; list?: string[]; links?: LegalLink[] };

export const PRIVACY_INTRO =
  "PermitOS is a pre-check for small businesses in Seattle. This page says what happens to what you give it, as the site works today. If that changes, this page changes with it.";

/** The sections that do not depend on the server's settings. The page adds the ones that do. */
export const PRIVACY: LegalSection[] = [
  {
    id: "what-you-send",
    heading: "What you send us",
    paragraphs: ["Only what you choose to give. You don't need an account, and we don't ask for your name."],
    list: [
      "Your answers about the business: the kind of business and the yes, no or not sure questions.",
      "Your floor plan file, if you upload one (PDF, PNG or JPG).",
      "A street address or a zone, if you give one.",
      "The measurements you confirm or type on step 3.",
      "Questions you ask the assistant, typed or spoken.",
    ],
  },
  {
    id: "plan",
    heading: "Your floor plan file",
    paragraphs: [
      // api/uploads.py: read_and_delete(); checker/extract.py: the picture goes to the Claude API
      "Your file goes to our server. The server checks that it is a PDF, PNG or JPG, turns it into a picture and sends that picture to the Claude API, run by Anthropic, which reads the rooms, doors and fixtures from it. Anthropic decides nothing: the rules on our server do.",
      "While it is read, the file is kept in a temporary file with a random name. That file is deleted as soon as the reading ends, whether it worked or not. We never store your plan file and never show it to anyone.",
      "Anthropic receives the picture only to read it. How long Anthropic keeps what is sent to its API is set by its commercial terms and privacy policy.",
      // api/main.py: a demo case uses its saved reading unless use_vision is asked for
      "The example plans are read from readings we saved beforehand. Nothing about them is sent to Anthropic.",
    ],
    links: [
      { text: "Anthropic's privacy policy", href: "https://www.anthropic.com/legal/privacy" },
      { text: "Anthropic's commercial terms", href: "https://www.anthropic.com/legal/commercial-terms" },
    ],
  },
  {
    id: "address",
    heading: "The address",
    paragraphs: [
      // checker/zoning.py: geocode() then lookup_district(); api/geo.py: zone_outline()
      "To find the zoning, our server sends the address to the US Census Bureau's geocoder, which turns it into a point on the map. It then sends that point, not the address, to the City of Seattle's zoning map service, hosted by Esri, to find the zone and its outline.",
      "A zone you type yourself is not sent anywhere. Our server never writes the address or the point to its log.",
    ],
  },
  {
    id: "assistant",
    heading: "The assistant",
    paragraphs: [
      // web/src/components/assistant/Assistant.tsx: before a result, answers from content/help.ts
      "Before your check has run, the assistant answers from fixed help text in your browser. Nothing is sent.",
      // api/main.py: ask() stores nothing; checker/agent.py sends the result and the question to the Claude API
      "After that, each question goes to our server with your check's result and, when the model is switched on, to the Claude API to write the answer. Questions and answers are not stored on our server. The conversation is kept in this page's memory only and is gone when you leave or reload the page.",
    ],
  },
  {
    id: "voice",
    heading: "Voice",
    paragraphs: [
      // web/src/voice/ondevice.ts (processLocally), api/audio.py, checker/voice.py
      "When your browser can turn speech into text on your device (recent versions of Chrome can), it does, and your voice never leaves your device.",
      "Otherwise your browser records the question and sends the recording to our server only. There it is converted and turned into text by an open-source speech model (faster-whisper) running on our server. A temporary copy made for the conversion is deleted as soon as it is converted, and the recording and the words are never stored or logged. Your voice is never sent to Google, Apple or any other company.",
      "Answers are read aloud by your browser's own voice. Some browsers only have online voices, which send the answer's text, never your voice, to the browser maker. Turn Voice off to type and read only.",
    ],
  },
  {
    id: "browser",
    heading: "In your browser",
    paragraphs: [
      // web/src/state/flow.ts (sessionStorage), web/src/voice/speech.ts (localStorage), no document.cookie anywhere
      "The site keeps your answers, the reading and your check's id in this tab's session storage, so Back and a refresh keep your work. It is cleared when you close the tab or press Start over. Whether Voice is on or off is remembered in this browser's local storage.",
      "We set no cookies, so there is no cookie banner.",
    ],
  },
  {
    id: "logs",
    heading: "Logs and limits",
    paragraphs: [
      // api/limits.py: RateLimiter in memory; api/errors.py and api/geo.py log only the kind of error
      "To keep the service free to use, our server counts requests from each internet address for a few minutes, to slow down automated use. These counts are held in memory only and are never written down.",
      "Our server's log records errors without plan contents, recordings, transcripts, questions or addresses. The companies that host the site and the server keep their own standard request logs (internet address, time and page asked for) for their own periods.",
    ],
  },
];

export const PRIVACY_NOT_SOLD = "We don't sell what you send us, share it for advertising, or use it to train models.";

/** Analytics, as configured at build time (src/lib/analytics.ts). */
export const PRIVACY_ANALYTICS_ON: LegalSection = {
  id: "analytics",
  heading: "Counting visits",
  paragraphs: [
    "We count page views and two events, a check was completed and a reading was corrected before the check, with Plausible Analytics. Plausible uses no cookies and keeps no personal data. Only the page's path is sent, never your check's link or anything you typed.",
  ],
  links: [{ text: "Plausible's data policy", href: "https://plausible.io/data-policy" }],
};
export const PRIVACY_ANALYTICS_OFF: LegalSection = {
  id: "analytics",
  heading: "Counting visits",
  paragraphs: ["We don't use analytics at the moment. If we start, it will be cookieless, and this page will say so first."],
};

/** Cloudflare Turnstile, as configured at build time (src/lib/turnstile.ts). */
export const PRIVACY_TURNSTILE: LegalSection = {
  id: "turnstile",
  heading: "Checking for automated use",
  paragraphs: [
    "Before a plan is read or a question answered, Cloudflare Turnstile checks that a person is using the site. Cloudflare looks at signals from your browser to do this; it does not show ads or track you across sites with it.",
  ],
  links: [{ text: "Cloudflare's Turnstile privacy addendum", href: "https://www.cloudflare.com/turnstile-privacy-policy/" }],
};

export const PRIVACY_CHECK = (days: number | null) => ({
  id: "check",
  heading: "Your check",
  paragraphs: [
    // api/store.py: save() stores facts, intake, zoning input and result; never the file
    "When you run the check, our server stores the measurements, your answers, the address or zone if you gave one, and the result. That is what keeps the results page, its link and the two PDFs working.",
    // api/config.py check_days(); api/main.py purges at start-up, every hour, and on each read
    `It is kept for ${days === null ? "the number of days shown on your results page" : `${days} days`}, then deleted automatically, at the latest an hour later. You can delete it sooner with "Delete this check now" on the results page.`,
    "Anyone with your results link can open the check until then, so share it only with people you trust.",
  ],
} satisfies LegalSection);

export const PRIVACY_CONTACT = {
  heading: "Questions or a request to delete",
  text: "Write to us at",
  after: "If you have lost your results link and want a check deleted, tell us roughly when you ran it and what kind of business it was.",
};

// ---------------------------------------------------------------- Terms (not reviewed by a lawyer)
export const TERMS_INTRO =
  "These terms cover your use of PermitOS. By using the site you agree to them. They are written to be read, so here they are in plain words.";

export const TERMS: LegalSection[] = [
  {
    id: "pre-check",
    heading: "A pre-check, not a city approval",
    paragraphs: [
      "PermitOS checks a floor plan against rules our team coded from Seattle's building and plumbing codes, the federal accessibility standards and the King County and Washington State food codes, and lists permits a business like yours usually needs.",
      "It is a pre-check. It does not approve a plan, issue a permit or make a code decision. Only the City of Seattle's reviewers and the other agencies named in your results do that.",
    ],
  },
  {
    id: "not-city",
    heading: "Not a City of Seattle service",
    paragraphs: [
      "PermitOS is made by an independent team. It is not run, endorsed or checked by the City of Seattle, King County, Washington State or any other government agency.",
    ],
  },
  {
    id: "not-advice",
    heading: "Not legal or professional advice",
    paragraphs: [
      "Nothing on the site is legal advice, or the advice of an architect, engineer or other licensed professional. For a decision that matters, such as signing a lease or starting work, ask a licensed design professional and the city.",
    ],
  },
  {
    id: "your-responsibility",
    heading: "You stay responsible for your application",
    paragraphs: [
      "You are responsible for your permit application, for what you build and for checking that your plan meets every rule that applies. A result with nothing to fix does not mean the city will agree.",
      "The model can misread a plan, and some rules are still being checked against the code text; each result says how far. Check every value we read against your plan before you rely on it.",
    ],
  },
  {
    id: "no-warranty",
    heading: "No warranty",
    paragraphs: [
      "The site is provided as it is and as available, free of charge. We make no promise that it is accurate, complete, up to date or always available, and we may change or stop it at any time.",
      "As far as the law allows, we are not liable for any loss or cost that comes from using the site or relying on its results, including delays, redesign costs, fees or lost business.",
    ],
  },
  {
    id: "fair-use",
    heading: "Using the site fairly",
    paragraphs: ["To keep it working for everyone:"],
    list: [
      "Upload only plans you have the right to share.",
      "Don't use the site to send personal information about other people.",
      "Don't overload it, scrape it, get round its limits or use it to build a competing service.",
    ],
  },
  {
    id: "your-content",
    heading: "What you send",
    paragraphs: [
      "What you upload and type stays yours. You allow us to process it only to run your pre-check, as the Privacy page describes.",
    ],
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    paragraphs: ["If we change these terms, we update this page and its date. Using the site after a change means you accept the new terms."],
  },
];
