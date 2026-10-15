# VERCHON Workspace Rules: Progressive Codebase Inspection & Engineering Integrity

## Core Principle: Understanding Per Token
Optimize for **useful understanding per token**, not the smallest possible number of files inspected. Operates at full engineering capability without mindless browsing or context-wasting sequential file scanning.

---

## 1. Search Before Reading
- **Locate before reading**: Prefer targeted symbol searches, filename searches, import tracing, and function/class outlines over speculative file browsing.
- **Direct extraction**: Once target locations are identified from search results or error stack traces, jump directly to the relevant line ranges.
- **No blind head/tail reading**: Do not automatically view the top 40 lines of a file if a targeted symbol match or import trace already pinpointed the target and its interface.
- **No sequential paging**: Never page through hundreds of lines in 100-line increments to locate code that could be found with a symbol search.

---

## 2. Sensible Slice Sizing (No Rigid Arbitrary Caps)
- **Initial inspection target**: Aim for approximately 30–60 lines per initial source inspection.
- **Justified larger reads**: Expand to 80–150 lines, 200+ lines, or full files when genuinely required to understand complex control flow, data models, state machines, React component lifecycles, or multi-module interactions.
- **Keep logical units intact**: Do not split a coherent function or JSX block into fragments merely to satisfy an arbitrary line limit.
- **Intentionality**: Have a specific reason before executing an unusually broad read (>150 lines), and state the rationale briefly.

---

## 3. Progressive Dependency Tracing
When investigating a feature or bug, follow this sequence:
1. Locate the requested symbol, feature, or error site.
2. Understand its immediate implementation and contract.
3. Trace relevant callers, callees, imports, API endpoints, data models, or state transitions.
4. Inspect additional modules only when they resolve a concrete dependency or uncertainty.
5. Stop when you understand enough to complete the requested task reliably.
- **Do not inspect unrelated modules** simply because they reside in the same folder or might tangentially connect to the feature.
- **Do not stop prematurely** when correctness depends on upstream data contracts, downstream side effects, statutory/business calculations, or failure edge cases.

---

## 4. Eliminate Redundant Reads
- **Context memory**: Maintain awareness of files and line ranges already inspected in the current session.
- **No repetitive re-reading**: Do not re-read unchanged files or previously viewed ranges without new evidence, recent file edits, external changes, or an explicit unresolved question.
- **Post-edit verification**: After modifying code, inspect git diffs and directly affected lines rather than re-reading the entire file by default.
- **External changes**: If tests fail unexpectedly, commands alter state, or external modifications are detected, re-read the affected target ranges promptly.

---

## 5. Task-Specific Inspection Protocols
- **Planning Mode**:
  - Inspect only enough code to ground architecture, locate integration points, and identify existing functions to reuse.
  - Return the plan with affected files, reusable logic, known risks, and unresolved decisions.
  - Do not start implementing early or exhaustively read files that might be altered later. Clearly separate verified facts from working assumptions.
- **Implementation Mode**:
  - Perform all inspection needed to implement safely and avoid regressions.
  - Reuse existing utilities and mathematical engines rather than duplicating logic.
  - Trace critical dependencies and test endpoints/components upon completion.
- **Debugging & Verification Mode**:
  - Follow the concrete evidence from logs, stack traces, and test assertions.
  - Expand investigation when the initial hypothesis fails verification.
  - Never stop at the first plausible explanation without verifying it against real runtime behavior or data.

---

## 6. Engineering Integrity & VERCHON Domain Invariants
Efficiency must never justify guessing about critical behavior:
- **Deterministic Analytics Engine**: Never alter, dilute, or invent new strategy stop losses, ATR filters, or momentum math unless explicitly directed.
- **Paper Trading Engine**: Strictly maintain statutory cost calculations (STT, exchange fees, stamp duty, GST), position sizing math, portfolio cash debits/credits, ledger persistence (`positions.json`), and trail stop updates.
- **Sector & Risk Guardrails**: Preserve concentration alerts (>30% sector, >20% position) as non-blocking informational safeguards.
- **AI Synthesis Boundaries**: Maintain the strict barrier between verified empirical data snapshots and AI interpretations. Risk Judge evaluations must respect the deterministic engine's invalidation boundary and allow inconclusive verdicts.
- **No Shadow Infrastructure**: Avoid duplicate business logic, unneeded dependencies, or redundant helper files.

---

## 7. Practical Stopping Rule
Stop exploring when available evidence is sufficient to answer the prompt or execute the change with confidence. Before opening another file or range, evaluate:
1. *What specific question will this inspection answer?*
2. *Is that answer strictly necessary for the current task?*
3. *Could a targeted symbol search or smaller excerpt answer it faster?*
4. *Has the relevant behavior already been established earlier in context?*

If further inspection is genuinely needed for safety and correctness, proceed without hesitation.

---

## 8. Process & Server Lifecycle Rule
- **Never start background servers autonomously**: Do not launch background processes or servers (`launch.py`, FastAPI backend, or AI model servers) on your own after completing an edit or task. Compile and test as needed, but leave server startup strictly to explicit user instructions.
