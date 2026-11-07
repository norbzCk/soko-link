# Soko-Link Design System

**Document:** `Design.md`\
**Status:** Current design-system baseline --- derived from the
implemented `frontend/src/styles/global.css` and shared UI primitives on
7 November 2026\
**Owner:** Soko-Link Product & Design\
**Last updated:** 7 November 2026

> **Contributor contract --- read this first**
>
> The “Market Modern” system is already implemented and approved in code.
> Extend it; do not redesign pages from scratch, introduce a second
> palette, add a component library, or bypass the shared primitives.
>
> - Read the existing page and `frontend/src/styles/global.css` before
>   changing visuals.
> - Reuse `frontend/src/components/ui/*` and the shared component classes
>   before adding new styles.
> - New visual patterns require a design decision, token support in
>   `global.css`, and consistent light/dark behaviour.
> - Do not use dead controls, placeholder success states, lorem ipsum, or
>   invented product data.
> - Update this document when an approved token, component, breakpoint,
>   or interaction standard changes.
> - Follow [CONTRIBUTING.md](CONTRIBUTING.md) for the required workflow.

## 1. Purpose

This document establishes the visual identity, interaction principles,
accessibility expectations, and frontend standards for Soko-Link. It is
the shared reference for product designers, frontend engineers, and AI
coding agents.

Soko-Link must feel like a trustworthy, modern marketplace: clear enough
for first-time customers, efficient for repeat buyers, and credible for
sellers and logistics partners. The experience should be distinctive
without sacrificing usability.

> **Governance rule:** Do not invent or silently change brand tokens. If
> the repository already contains approved logo assets, colours,
> typography, or design tokens, audit and preserve them unless a
> documented design decision approves a change.

## 2. Brand foundations

### 2.1 Product character

The brand should communicate:

-   **Trust:** transparent prices, clear order states, credible seller
    information, and honest feedback.
-   **Connection:** buyers, sellers, suppliers, and delivery partners
    working through one marketplace.
-   **Clarity:** simple language, predictable navigation, and
    understandable next steps.
-   **Reliability:** consistent interactions and accurate transaction
    information.
-   **Progress:** a modern, adaptable platform built for local commerce
    and future growth.

### 2.2 Brand voice

Use clear, respectful, confident language. Prefer familiar words over
technical jargon. Explain what happened, what it means, and what the
user can do next.

Examples: - Prefer "Your order has been received" over "Order entity
created". - Prefer "Payment is awaiting confirmation" over "Pending
callback". - Never claim that an order, payment, refund, or delivery is
complete until the backend confirms it.

### 2.3 Audience-aware experience

  -----------------------------------------------------------------------
  Audience                Primary needs           Experience priority
  ----------------------- ----------------------- -----------------------
  Customer                Discover products,      Simple shopping and
                          compare options, buy    transparent status
                          confidently, follow     
                          orders                  

  Seller                  Manage products, stock, Efficient business
                          orders, and customer    workspace
                          activity                

  Logistics provider      View assigned           Clear operational task
                          deliveries and update   flow
                          progress                

  Administrator           Govern users, listings, Safe, auditable
                          disputes, and           administration
                          operations              

  Analyst                 Understand authorised   Accurate, explainable
                          marketplace performance data
  -----------------------------------------------------------------------

## 3. Visual design principles

1.  **Hierarchy before decoration:** make the most important action and
    information obvious.
2.  **Consistency:** reuse shared tokens and components instead of
    styling each page independently.
3.  **Product-led presentation:** product images, names, prices,
    availability, and seller details must be easy to scan.
4.  **Trust through transparency:** show fees, delivery information,
    payment state, and order status clearly.
5.  **Responsive by design:** mobile is a first-class experience, not a
    compressed desktop layout.
6.  **Purposeful motion:** animation must clarify state or provide
    feedback, never distract.
7.  **Accessible by default:** support keyboard, assistive technology,
    readable contrast, and clear focus.

## 4. Brand assets and design tokens

### 4.1 Asset rules

-   Use the official Soko-Link logo and approved variants from the
    repository.
-   Do not recreate, distort, recolour, or place the logo on
    low-contrast backgrounds without an approved variant.
-   Use consistent image aspect ratios for product cards and galleries.
-   Prefer real product imagery supplied by the platform; use clearly
    identified placeholders only in development.
-   Avoid generic stock imagery that misrepresents actual sellers or
    products.

### 4.2 Current token source of truth

**Single source:** `frontend/src/styles/global.css`. Tokens are declared
in `@theme`, `:root`, and `[data-theme="dark"]`. Tailwind utilities map
to those CSS variables. Do not add a second palette, a competing theme
file, or hard-coded hex values in page components.

| Category | Current value / token | Usage |
| --- | --- | --- |
| Brand (light) | `--brand: #0e5aa7` | Primary actions, links, focus |
| Brand (dark) | `--brand: #6cb2f6` | Primary actions in dark theme |
| Brand strong | `--brand-strong: #0a4682` / `#4d9be8` | Hover/pressed brand |
| Brand soft | `--brand-light: #e9f2fc` / `rgba(108,178,246,.12)` | Tinted surfaces, badges |
| Accent | `--accent: #ef9f2f` / `#f6b95a` | Limited emphasis, ratings |
| Accent strong | `--accent-strong: #cf8420` / `#e2a23c` | Accent text on tinted surfaces |
| Background | `--bg: #f6f6f1` / `#080f1a` | Page background |
| Surface | `--surface: #ffffff` / `#0f1928` | Cards, panels, inputs |
| Surface soft | `--surface-soft: #f1f1ea` / `#16243a` | Secondary panels, hover |
| Text | `--text: #0c1a2b` / `#eef4fb` | Primary text |
| Text muted | `--text-muted: #5b6675` / `#93a4ba` | Secondary text |
| Border | `--border: #e4e3da` / `#1e2f47` | Dividers, input borders |
| Success | `--success: #0f9d6a` / `#34d399` | Verified, paid, completed |
| Danger | `--danger: #dc4b4b` / `#f17878` | Errors, destructive actions |
| Display font | Sora (`--font-display`) | Headings, brand, prices |
| Body font | Inter (`--font-sans`) | Body, labels, controls |
| Card radius | `--radius-card: 1.25rem` | Cards, panels, media frames |
| Control radius | `0.75rem` | Inputs, buttons, chips, dialogs |
| Shadow soft | `--shadow-soft` | Default surface elevation |
| Shadow lift | `--shadow-lift` | Hover/active emphasis |

Theme behaviour:

- The active theme is stored on `<html data-theme="light|dark">`.
- The `dark:` Tailwind variant is configured against
  `[data-theme="dark"]` in `global.css`.
- Every new component must be checked in both themes.
- The legacy classes in `global.css` (`.glass-card`, `.stat-card`,
  `.btn-primary`, `.field-input`, etc.) are compatibility aliases used by
  existing pages. Do not remove them; migrate pages deliberately.

### 4.3 Shared component inventory

| Component | Location | Required behaviour |
| --- | --- | --- |
| `Button` | `frontend/src/components/ui/Button.tsx` | Variants, sizes, loading, icons, full width, disabled |
| `Field` / `Input` / `Textarea` / `Select` | `frontend/src/components/ui/Field.tsx` | Label, helper/error text, wrapper `className` support |
| `Badge` / `StatusBadge` | `frontend/src/components/ui/Badge.tsx` | Semantic tones; never colour-only |
| `ProductCard` | `frontend/src/components/ui/ProductCard.tsx` | Image, badges, seller, price, add-to-cart, manager actions |
| `ImageUploader` | `frontend/src/components/ui/ImageUploader.tsx` | Drag/drop, preview, remove, type/size validation, upload state |
| `PageIntro` / `SectionCard` / `EmptyState` / `InlineNotice` / `StatCards` | `frontend/src/components/ui/PageSections.tsx` | Consistent page headers, panels, states, metrics |
| `Modal` | `frontend/src/components/Modal.tsx` | Portal to `#modal-root`, overlay/Escape/close, focus and scroll lock |
| `AuthScene` | `frontend/src/components/AuthScene.tsx` | Split auth shell, compact form column, mobile brand header |
| `BrandMark` | `frontend/src/components/BrandMark.tsx` | Approved logo and wordmark treatment |
| `Sidebar` | `frontend/src/components/Sidebar.tsx` | Role-aware navigation, active state, mobile slide-over |

Rules:

- Extend an existing primitive before creating a new one.
- New reusable components belong in `frontend/src/components/ui/`.
- Page-specific styling stays in the page unless the pattern is reused.
- Do not reintroduce raw one-off buttons, inputs, or badge markup when a
  primitive already covers the need.

## 5. Typography and content

-   Use one primary interface typeface with a clear fallback stack.
-   Establish a consistent hierarchy for page titles, section headings,
    body text, labels, helper text, and metadata.
-   Keep body text comfortably readable on mobile.
-   Avoid long all-caps labels and excessive font-weight variation.
-   Use consistent currency, date, number, and measurement formatting.
-   Write concise labels and meaningful validation messages.
-   Do not use colour alone to communicate important status.

## 6. Layout and responsive behaviour

Use a consistent spacing scale and predictable content widths. Align
page content to a shared grid. Keep forms, tables, cards, and dashboard
panels visually related.

Responsive requirements: - **Small mobile:** prioritise the main task,
use touch-friendly controls, stack complex layouts, and avoid horizontal
overflow. - **Mobile/tablet:** adapt navigation and multi-column
layouts; keep search and primary actions easy to reach. - **Desktop:**
use available space without making line lengths or product grids
excessively wide.

Breakpoints should be defined centrally in the existing styling system.
Test at representative narrow, medium, and wide viewport widths rather
than relying on a single device preset.

## 7. Component standards

All reusable components must have consistent visual and behavioural
states.

  -----------------------------------------------------------------------
  Component                           Required states / behaviour
  ----------------------------------- -----------------------------------
  Buttons                             Default, hover, focus, active,
                                      disabled, loading

  Inputs                              Default, focus, invalid, disabled,
                                      helper text

  Search                              Empty, typing, results, no results,
                                      request failure

  Product card                        Normal, unavailable, discounted
                                      (only when valid), loading

  Badges                              Clear semantic meaning; never
                                      colour-only

  Dialogs/drawers                     Keyboard focus management,
                                      escape/close behaviour, labelled
                                      title

  Toasts/alerts                       Clear message, suitable duration,
                                      accessible announcement

  Tables                              Responsive strategy, empty state,
                                      loading and error states

  Forms                               Labels, inline validation,
                                      submission feedback,
                                      duplicate-submit prevention

  Skeletons                           Match the shape of the content
                                      being loaded
  -----------------------------------------------------------------------

Do not create a new component when an existing shared component can be
extended safely.

## 8. Core page experience

### Marketplace homepage

-   Explain Soko-Link's value immediately.
-   Make product search and category discovery prominent.
-   Show only genuine, available marketplace content.
-   Use purposeful sections with clear hierarchy.
-   Provide clear entry points for customers and business users.

### Catalogue and search

-   Keep search, filters, sorting, and result count understandable.
-   Preserve filter state where appropriate.
-   Make empty results helpful and actionable.
-   Ensure filters work with real backend data.

### Product details

-   Prioritise imagery, product name, price, availability, seller
    identity, and purchase action.
-   Explain relevant specifications, delivery information, and policies.
-   Distinguish unavailable stock from loading or unknown stock.

### Cart and checkout

-   Show item quantities, prices, totals, and applicable charges
    transparently.
-   Make editing and removal straightforward.
-   Prevent accidental duplicate submissions.
-   Clearly distinguish payment initiation from confirmed payment.
-   Do not invent provider options, fees, or success states.

### Role workspaces

Customer, seller, logistics, administrator, and analyst experiences must
be task-oriented and permission-aware. Do not expose controls the
current user is not authorised to use. Backend authorization remains
authoritative.

## 9. Interaction and feedback

Every action must produce an understandable result. Provide: - Loading
feedback for asynchronous operations. - Success confirmation after
server confirmation. - Specific and actionable errors where safe. -
Confirmation for destructive or consequential actions. - Empty states
that explain how to proceed. - Disabled states with a clear reason where
appropriate.

Avoid dead buttons, fake links, decorative controls that imply
functionality, and silent failures.

## 10. Accessibility

Target WCAG 2.2 AA as the design and implementation goal.

-   Use semantic HTML and correct heading order.
-   Associate form labels and errors programmatically.
-   Ensure keyboard access and visible focus.
-   Provide accessible names for icon-only controls.
-   Maintain sufficient text and non-text contrast.
-   Respect reduced-motion preferences.
-   Provide meaningful alternative text for informative images.
-   Ensure dialogs and menus manage focus correctly.
-   Test important journeys with keyboard-only navigation.

## 11. Design quality gates

A page is not complete until: - It follows the approved token system. -
It works at supported viewport widths. - All visible controls work. -
Loading, empty, success, and error states are considered. - Content is
accurate and uses real API data where required. - Keyboard and
accessibility basics are verified. - No unintended console errors or
layout overflow remain.

## 12. Design decisions register

Record significant decisions here with date, owner, rationale, and
status.

| Decision | Status | Owner | Notes |
| --- | --- | --- | --- |
| Official logo and variants | Current | Product/Brand | `frontend/src/assets/sokolink-logo.png` via `BrandMark`; preserve approved variants. |
| Primary and secondary palette | Current | Product/Brand | “Market Modern” ocean-blue/saffron tokens in `global.css`; see section 4.2. |
| Typography | Current | Product/Design | Sora for display, Inter for body; loaded from the app shell/HTML. |
| Design-token source | Current | Frontend | One source: `frontend/src/styles/global.css` (`@theme` + CSS variables). |
| Responsive breakpoints | Current | Frontend | Tailwind defaults; verify at narrow, medium, and wide viewports. |
| Dark mode | Current | Frontend | `data-theme` attribute; `dark:` variant bound to it in `global.css`. |
| New component library | Rejected | Product/Design | Extend `components/ui/*`; do not add a parallel system. |
| Page-level redesign without baseline review | Rejected | Product/Design | Start from the implemented page; propose targeted changes with evidence. |

Any new row must state the date, owner, rationale, affected tokens or
components, and migration impact.

## 13. Maintenance

Update this document whenever an approved brand, token, component,
accessibility, or interaction standard changes. Significant changes
should be reflected in the frontend implementation and reviewed
alongside this document.

### 13.1 Design contribution workflow

1. Read the current page and the shared primitives it uses.
2. Check whether an existing token, class, or primitive covers the need.
3. If a new token is genuinely required, add it to `global.css` first and
   use it everywhere.
4. Implement the smallest change that preserves existing behaviour.
5. Verify light/dark themes, loading/empty/error states, keyboard focus,
   and responsive widths.
6. Run `tsc --noEmit -p tsconfig.app.json` and `npm run build` in
   `frontend/`.
7. Update this document if the approved pattern changed.

Do not submit a page rewrite, a new palette, or a new UI dependency as
part of an unrelated feature or bug fix. Visual changes must remain
reviewable and reversible.
