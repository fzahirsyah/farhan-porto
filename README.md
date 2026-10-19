# Farhan Zahirsyah — Portfolio Version 3

Open `index.html` directly for the portfolio, or deploy this entire folder to a static host. No Node.js, npm, Python, installation or build step is required to use the delivered site.

## What is implemented

- Ten responsive chapters with native scroll choreography and chapter navigation.
- The unchanged original portrait and bundled October 2026 CV.
- Inline SVG architecture modules with accessible engineering-detail dialogs.
- An AI/CRM workflow simulation with retrieval, tool calls, record updates, follow-up and human handover.
- Synthetic document scanning, prepared credit-routing examples and analytics.
- Requirements/wireframe/product stages and three engineering stations.
- Spreadsheet cell inspection and recalculation, plus a simulated API pipeline.
- Four supplied product demos with visible return links, including nested app routes and body replacement.
- An expandable career timeline using official CV titles and dates.
- Email, LinkedIn, GitHub, website and resume links.
- Optional bundled Three.js silk, with SVG/canvas fallback and reduced-motion support.

## Play the story

The hero's **Play the story** button runs all ten chapters without manual scrolling. The default sequence is 2 minutes 56 seconds. Each chapter has its own duration; the project showcase receives a 24-second presentation window.

The playback bar provides pause/resume/replay, previous/next chapter, speed settings (0.75×, 1×, 1.25×, 1.5×) and exit. Wheel or touch input pauses the tour. Clicking a project or another interactive control pauses it so the visitor can explore. Escape exits the player. Normal navigation remains available.

Desktop scenes use sticky viewports and reversible scroll progress. On smaller screens or short windows, the page uses natural vertical layouts. Turning motion off also restores natural scrolling and shows all three engineering stations.

## Demos

| Demo | Route | Notes |
|---|---|---|
| Pradi | `projects/pradi/index.html` | Existing medical-practice landing and interactive demo. |
| Accu-Z | `projects/accuz/index.html` | Supplied browser accounting application. |
| Event Spotlight | `projects/eventspotlight/index.html` | Launcher for ERP, admin, shop, crew, partner and booth. |
| NotaKris | `projects/notakris/index.html` | Office and client-portal launcher; phases 0–2 checkpoint. |

Browser storage, SQLite/WASM and app-specific browser APIs can behave differently under `file://`. Static hosting is the recommended way to explore every demo. Demos retain their supplied application logic and bundled libraries; integration changes are limited to HTML return-link wrappers and the shared return guard.

Portfolio simulations and product preview illustrations are synthetic. The preview illustrations do not claim exact screenshot fidelity. The applications use their own supplied sample data. No live AI, customer messaging, payments or external business accounts are connected by the portfolio.

## Files

- `index.html`: page content, inline SVGs, accessible controls and local asset links.
- `css/style.css`: responsive presentation and chapter layouts.
- `css/player.css`: story transport controls and showcase presentation refinements.
- `js/main.js`: native chapter controller, interactive examples, story playback and atmosphere.
- `js/vendor/`: bundled Three.js r128 and its MIT license.
- `assets/`: portrait, CV, graphics, previews, branding and social card.
- `projects/`: supplied applications and shared return guard.

## Verification

See `validation-report.json` for source checks, automated DOM interaction checks and the scope of browser verification. The desktop hero, four-card project chapter, timed playback, phone layouts at 375 × 667, Accu-Z application and invoice navigation, and return-to-portfolio link were checked in Chrome.

Automated checks cover interactions and return-guard recovery after an application replaces its entire body. They do not replace visual checks or claim exhaustive testing of every supplied application workflow. Safari and Firefox have not been tested in this session.

## Rights and provenance

The portrait, CV and supplied project branding are unchanged originals. Custom SVG artwork was authored for this portfolio. Third-party application libraries retain their supplied licenses. Three.js is bundled under the MIT license in `js/vendor/THREE-LICENSE.txt`.
