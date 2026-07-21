# Refine the Overview triage experience

## Current state
The Overview page is already structured as an operational cockpit: command bar, 6 priority cards, a left triage queue, a center selected-matter panel, and a right rail of AI recommendations + upcoming events + alerts. It uses the new legal status vocabulary and deterministic mock data. The main gaps are interactivity and actionability: cards are mostly static, the queue has no filtering or keyboard support, and the selected matter panel only shows information, not clear next actions.

## Proposed changes

### 1. Make the priority strip actionable
- Clicking a card updates the work area or routes to the relevant view:
  - **Urgent matters** — filters the triage queue to Urgent / Escalated.
  - **Contracts to sign** — navigates to `/dashboard/contracts` filtered to awaiting-client/review status.
  - **AI needs review** — navigates to `/dashboard/ai-review` with the low-confidence filter active.
  - **Hearings this week** — navigates to `/dashboard/hearings`.
  - **New leads** / **Monitoring alerts** — show a quick inline preview or navigate to Intake / AI Review.
- Add a `cursor-pointer` and hover state to cards that are linked, and keep non-linked cards visually distinct.

### 2. Improve the triage queue
- Add a compact filter row above the queue: status, matter type, and owner (reusing the same filter pattern from AI Review).
- Add keyboard navigation: arrow keys move selection, Enter opens the selected matter detail.
- Highlight unread items and recently updated items with a subtle dot or badge.
- Show owner initials next to each matter row.
- Keep the default selection logic: highest-priority urgent matter first, else first queue item.

### 3. Add status-based next actions to the selected matter panel
- Replace the generic "Take next step" button with a context-aware primary action based on the selected matter's status:
  - **Urgent / Escalated** → "Escalate to partner" or "Review now"
  - **Pending Review** → "Review documents"
  - **Awaiting Client** → "Send client reminder"
  - **Scheduled** → "View calendar"
- Keep secondary actions: "Open documents", "View audit trail".
- Add a quick "Mark as reviewed" or "Snooze" tertiary action for triage hygiene.
- Surface linked contracts and documents as clickable chips.

### 4. Refine the right rail
- **AI recommendations** — only show items for the selected matter; if none, show a reassuring "No AI flags on this matter" state.
- **Alerts** — keep severity color coding and add a link to the full monitoring view.
- **This week** — keep the compact hearings list, but link each item to the matter detail.

### 5. Improve mobile behavior
- Collapse the 3-column work area into a stacked layout on small screens.
- Keep the priority strip as a 2×3 grid.
- Convert the triage queue into a scrollable card list with the selected matter panel below it.
- Make the command-bar quick actions horizontally scrollable and keep the search bar full width.

### 6. Strengthen empty and loading states
- Empty queue: friendly message with "New matter" and "Upload document" CTAs.
- No search results: clear reset-search action.
- No selected matter: prompt the user to select from the queue.

## Assumptions and guardrails
- Data remains deterministic from `src/lib/juriscore/legal-mock.ts`; no backend changes in this pass.
- Actions are client-side demo actions (toasts, state updates, or navigation) rather than real mutations.
- Existing navigation labels and governance routes remain untouched.
- Keep the current violet/cream design system and typography.

## Success criteria
- A partner can land on `/dashboard`, see what needs attention, click a priority card, and immediately view the filtered queue.
- The selected matter panel clearly shows the next recommended action.
- The page is fully usable on mobile without horizontal scrolling.
