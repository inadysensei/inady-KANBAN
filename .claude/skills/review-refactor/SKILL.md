---
name: review-refactor
description: Definition-of-done gate after implementing a feature or non-trivial change. Runs a two-perspective subagent review (React/Next specialist + Senior VP Engineer), applies the agreed refactors incrementally, and confirms the full test gate passes before finishing. Use when an implementation looks complete and before considering work done.
argument-hint: "[optional scope: a path, or 'staged'/'HEAD~1'; defaults to current uncommitted changes]"
---

Run the project's review-and-refactor "definition of done" gate. Scope: $ARGUMENTS (if empty, review the current uncommitted changes).

Current working-tree changes for orientation:
!`git --no-pager status --short`

Follow these steps in order. **Tests must be All Green at every checkpoint.**

1. **Green baseline.** Run `npm test`. If anything fails, STOP and report — fix the failures (or tell me) before reviewing. Don't review on red.

2. **Review — two perspectives, in parallel.** Delegate to BOTH subagents at once (one message, two Agent calls), each scoped to the change:
   - `react-next-reviewer` — front-end / Next / hooks / a11y.
   - `senior-vp-reviewer` — architecture / robustness / simplicity / testability.
   They review and recommend only; they do not edit.

3. **Synthesize.** Merge and de-conflict the two lists. Keep concrete, low-risk, behavior-preserving refactors; drop nitpicks, style-only churn, and anything that changes integration behavior or reverts a documented design decision (see CLAUDE.md). Prioritize.

4. **Refactor incrementally.** Apply the agreed changes one logical step at a time. After EACH step run `npm test` (and `npx tsc --noEmit` when types changed). If a step breaks a test, fix or revert it before moving on — never leave the suite red. When you extract pure logic, add unit tests for it (but don't widen the coverage gate — see CLAUDE.md).

5. **Final gate.** Run all of: `npm test`, `npm run typecheck`, `npm run build`. All must pass. If any fails, fix until green.

6. **Report & finish.** Summarize what each perspective found and what you applied, and confirm the final green status. Only consider the work complete once step 5 is green. Do not commit unless I ask.
