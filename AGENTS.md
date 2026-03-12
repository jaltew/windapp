# AGENTS.md

## Project intent
Build a **simplified public wind-site analysis web app** in **React + TypeScript + JSON-driven mock data first**, designed for iterative page-by-page development with Codex.

This repo is **not** a direct implementation of the uploaded spec. The spec is useful as a **backend/event reference**, but the product we are building should correct several UI/UX issues in that draft and prioritize a cleaner public user journey. The source spec describes a one-shot map flow, SSE events, result schemas, and suggested screens. Use it as technical reference only, not as the final UX truth. See uploaded spec summary in chat context.

## Primary product principle
The app should feel like a **simple consumer-facing location analysis tool**, not an internal dashboard.

Favor:
- one clear next action per screen
- minimal controls
- progressive disclosure
- plain-language labels
- visually calm maps and cards
- strong empty, loading, and error states

Avoid:
- expert-first UI
- too many toggles
- map-style switching unless explicitly required
- exposing every raw backend metric on primary screens
- cluttered layouts
- dead-end screens

## Hard UX corrections from the product direction
These override the original spec where there is conflict.

1. **Do not add map style switching in the MVP.**
   - No terrain/light/dark/satellite toggle in the first versions.
   - Use one default basemap only.
   - The map is for location selection and contextual understanding, not GIS exploration.

2. **Do not show yearly earnings as a headline metric in the MVP.**
   - Financial outputs are optional and should not drive the primary public journey.
   - The initial results page should focus on:
     - mean wind speed
     - annual energy production
     - wind resource score
     - site utilization score
   - Secondary metrics like CO2 avoided or payback can be added later only if clearly supported and useful.

3. **Keep the first-page experience extremely simple.**
   - The user should be able to land, understand the purpose, pick a location, and continue.
   - No dense explanation blocks.
   - No advanced controls.
   - No editable technical parameters in the MVP.

4. **Page-by-page construction is mandatory.**
   - Do not scaffold the whole app in one go unless asked.
   - Build one page at a time.
   - Each page must be production-quality before moving on.

## Product shape for the simplified version
Assume this app has the following top-level flow:

1. **Landing / location page**
   - Short headline
   - Short supporting copy
   - Search input or map click to choose a location
   - Selected location state
   - Primary CTA to start analysis

2. **Analysis / loading page**
   - Strong sense of progress
   - Minimal, reassuring status language
   - Optional lightweight live map updates
   - No jargon-heavy processing checklist unless simplified for users

3. **Results summary page**
   - Easy-to-scan result cards
   - One map panel with only useful overlay controls
   - Primary recommendation / summary
   - Secondary details below the fold

4. **Detailed report page**
   - Only after summary page is solid
   - Use sections and visual hierarchy
   - Keep technical data readable and collapsible

## Technical approach
Default stack unless the user says otherwise:
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui for primitives if useful
- JSON fixtures / mocked data first
- React Query only when data fetching complexity justifies it
- Zod for schema validation when wiring real API data
- MapLibre GL only if a real interactive map is required for the page being built

## Architecture rules
- Prefer a **feature-based folder structure** over dumping everything into `components/`.
- Separate:
  - `pages/`
  - `features/`
  - `components/`
  - `lib/`
  - `types/`
  - `mocks/`
- Keep presentational and stateful logic reasonably separated.
- Keep map-specific code isolated behind small wrapper components/hooks.
- When possible, define API/event contracts in `types/` and keep UI models separate from raw transport models.

## Working mode for Codex
When asked to implement something:

1. Read this file first.
2. Optimize for the requested page only.
3. Do not expand scope unless necessary.
4. Before coding, state:
   - what page is being built
   - what assumptions are being made
   - what is intentionally deferred
5. Then implement.
6. End with:
   - files changed
   - what to review visually
   - next logical page

## Design direction
Aim for:
- clean Scandinavian / climate-tech feel
- large spacing
- restrained color palette
- strong typography hierarchy
- obvious CTA styling
- cards with concise labels and values
- responsive layout from the start

Do not:
- overuse gradients
- overload maps with controls
- use tiny labels
- create a dashboard aesthetic too early

## Map UX rules
- Default to a single basemap.
- Keep controls minimal.
- Use a single clear marker for selected location.
- If overlays exist later, they must have obvious value.
- Avoid exposing technical GIS concepts to end users unless explicitly needed.

## Copy rules
- Use plain English.
- Prefer “Estimate wind potential for this location” over technical phrases.
- Avoid backend terminology like “roughness,” “CERRA,” “Weibull,” or “correction cascade” on primary screens.
- Technical terms belong in advanced sections only.

## Data strategy
Start with mocked JSON data before real API integration.

Suggested progression:
1. static mocked page states
2. typed mock services
3. wiring to real endpoints
4. SSE integration
5. persistence/report retrieval

The uploaded spec contains the backend contracts for future integration, including:
- `POST /one-shot/stream`
- SSE events like `token`, `progress`, `buildings`, `landcover_preview`, `trees`, `obstacles`, `result`, `error`
- `POST /{shareToken}/save-email`
- `GET /{shareToken}/report`

But do **not** let those contracts force a poor first-pass UI.

## Scope control
Unless the user explicitly asks for it, do not add:
- authentication
- CMS integration
- analytics setup
- internationalization
- dark mode
- map style selector
- complicated settings panels
- advanced turbine configuration
- speculative finance widgets

## Quality bar
Every page should include:
- empty state
- loading state
- error state
- responsive layout
- accessible labels and keyboard interaction
- sensible TypeScript types
- no obvious placeholder UX

## Definition of done for each page
A page is only “done” when:
- the layout is polished
- the core interaction works
- states are covered
- the code is understandable
- the page can be shown to a designer/founder without apology

## When the spec conflicts with product direction
Prefer:
1. user clarity
2. simplicity
3. visual calm
4. progressive disclosure
5. implementation speed

Use the uploaded spec as backend reference, not final product truth.
