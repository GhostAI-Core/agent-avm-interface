@AGENTS.md

# Agent AVM Interface - Senior Developer's Handbook

## 1. Recursive Memory
**Instruction:** At the end of every significant session or feature completion, proactively suggest updates to CLAUDE.md. Specifically, document any 'Known Quirks' (e.g., specific library bugs, unconventional workarounds we used) and 'Implicit Architectural Rules' we established during the session.

## 2. Advanced Workflow Instructions
- **The Spec-First Rule:** Before writing code for a new feature, always generate a plan.md or updated spec. Do not proceed to implementation until the plan is approved. Follow a 'Waterfall-in-15-minutes' approach: define requirements, edge cases, and data models first.
- **The Tester-Implementer Loop:** When asked to fix a bug, first write a failing test case that reproduces the issue. Only after the test fails should you suggest the fix. Your goal is a 'green' test suite.
- **The Context Gatekeeper:** If a request requires knowledge of external documentation not present in the codebase, ask for the URL or file before attempting a solution. Do not hallucinate API parameters.

## 3. Tech-Specific Best Practices (2026 Standards)
### Performance
- Always eliminate request waterfalls by using Suspense boundaries. Avoid barrel imports that bloat bundle sizes.
### React/Next.js
- Prefer Compound Component patterns over 'Boolean Prop Hell.' Use next/dynamic for heavy client-side components.
### State Management
- Subscribe to derived state booleans rather than raw values to minimize re-renders.
### Security
- Audit every API endpoint against OWASP Top 10. For every new PR, identify potential race conditions or memory leaks.

## 4. Prompting Skills (System Prompt Level)
- **XML Tag Structuring:** Wrap complex multi-part instructions in `<task>`, `<context>`, and `<output_requirements>` tags. I will do the same for you.
- **Chain-of-Thought Activation:** Always reason step-by-step in a hidden `<thinking>` block before providing the final code. If you are uncertain, explain the trade-offs between two possible paths.
- **Negative Space Prompting:** In your responses, do not include introductory fluff ('Sure, I can help with that'). Provide only the code, the reasoning, and a brief summary of changes.

## 5. Active Project Issues (14-15)
- **#14: [FE] Tailwind + global CSS cleanup (post-MUI migration)**
  - **Goal:** Reduce/remove Tailwind usage that duplicates MUI after migration.
  - **Key:** No conflicting resets, successful build/lint, documented remaining Tailwind usage.
- **#15: [FE] QA — a11y, keyboard, responsive smoke (MUI migration)**
  - **Goal:** Final QA pass for accessibility, keyboard navigation, and responsiveness.
  - **Key:** Checklist completion for all key flows, focus visibility, `aria-label` coverage.


