---
name: targeted-inspection
description: >-
  Workflow and strategies for token-efficient, progressive codebase navigation and inspection.
  Use when exploring unfamiliar files, locating symbols, tracing dependencies, debugging, or planning architecture.
---

# Progressive, Targeted Codebase Inspection

This skill defines the engineering workflow for navigating, exploring, and inspecting codebases with high signal-to-noise ratio and optimal token efficiency.

The objective is to maximize **useful understanding per token**—avoiding mindless browsing while never sacrificing depth, accuracy, or architectural correctness.

---

## 1. Targeted Discovery (Search Before Reading)

Rather than opening files and reading sequentially from line 1, always locate target code using high-precision discovery techniques:

### Pattern A: Symbol & Declaration Searches
Locate function, class, type, or state declarations directly:
```powershell
# PowerShell search for function/component definitions
Select-String -Path "frontend/src/**/*.jsx" -Pattern "function PortfolioRiskBridgeCard" -Context 0,2
Select-String -Path "*.py" -Pattern "def get_proposed_trade_impact" -Context 0,2
```
*Result*: Yields exact file path and line number immediately.

### Pattern B: Import & Route Tracing
Trace where an API endpoint, model, or helper is imported and mounted:
```powershell
# Locate API route mount points
Select-String -Path "server.py" -Pattern "/api/paper-trades/portfolio-impact" -Context 1,5
```

### Pattern C: Targeted File Structure Inspection
When locating a file whose name is unknown:
```powershell
# List matching files quickly without scanning file bodies
Get-ChildItem -Path "frontend/src" -Filter "*Risk*" -Recurse | Select-Object FullName
```

---

## 2. Sensible Slice Sizing (Adaptive Context Windows)

Do not adhere to rigid, artificial line caps that fragment coherent logic. Adapt the inspection slice to the nature of the target:

| Target Structure | Recommended Initial Range | When to Expand |
| :--- | :--- | :--- |
| **Route Handler / Controller** | 30–60 lines | Expand to 80–120 lines to inspect request validation, middleware, and full error handlers. |
| **Mathematical / Trading Formula** | Complete formula block (25–50 lines) | Expand to include parameter initializers and edge-case guards. |
| **React Component / Hook** | 50–90 lines | Expand to 150–250 lines if props, hook effects (`useEffect`), and JSX return are tightly coupled. |
| **Class / Data Model Definition** | 40–80 lines | Expand if methods inherit or override base class behavior. |
| **Bug / Stack Trace Location** | 20 lines around the throwing line | Expand upstream to trace caller arguments or state mutations. |

### Guideline for Broad Reads (>150 Lines)
When inspecting a large function or component in full, formulate and state the specific question beforehand:
> *"Inspecting full component `AIDossierCard.jsx` lines 460–620 to verify the closing JSX container structure and prevent syntax mismatches in the adversarial layout."*

---

## 3. The 5-Step Progressive Dependency Chain

Follow this progressive sequence to resolve engineering questions without exploring unrelated code:

```
[Step 1: Anchor]
Locate exact symbol / entry point via search or stack trace
       │
       ▼
[Step 2: Immediate Contract]
Inspect function signature, arguments, return type, and primary logic
       │
       ▼
[Step 3: Dependency Verification]
Trace ONLY direct inputs/outputs (upstream data source, downstream caller, database/cache query)
       │
       ▼
[Step 4: Check Invariants & Edge Cases]
Verify null checks, error handling, and domain-specific rules (e.g. stop loss, risk limits)
       │
       ▼
[Step 5: Safe Termination]
STOP as soon as the interface and requirements are fully understood. Do NOT wander into adjacent modules.
```

### When Broader Tracing IS Required:
Do **not** stop prematurely if:
- Correctness depends on data transformations occurring in an upstream caller.
- State mutation triggers side effects in downstream event listeners or ledgers.
- The change touches shared data schemas or statutory financial formulas (e.g., brokerage, STT, tax).
- An observed bug cannot be explained solely by the local function body.

---

## 4. Task-Specific Playbooks

### Playbook 1: Architecture & Planning Mode
- **Goal**: Formulate a complete, grounded implementation plan without writing code.
- **Workflow**:
  1. Inspect the entry point to confirm signature and contracts.
  2. Identify existing utilities to reuse (avoid duplicate helpers).
  3. Locate external dependencies, database paths, and API schemas.
  4. Stop exploration. Output the plan with concrete file paths, symbols, risks, and open decisions.
- **Guardrail**: Do not inspect implementation details of every component that will be modified later.

### Playbook 2: Implementation Mode
- **Goal**: Implement features or fixes cleanly, safely, and without regressions.
- **Workflow**:
  1. Inspect the target lines and their surrounding context.
  2. Implement changes using minimal, surgical replacements (`replace_file_content`).
  3. Inspect diffs via `git diff` or targeted line checks—do not re-read the whole file.
  4. Execute verification scripts or builds (`npm run build`, Python unit tests).

### Playbook 3: Debugging & Verification Mode
- **Goal**: Identify and eliminate root causes using empirical evidence.
- **Workflow**:
  1. Start at the exact line and message from the exception or log.
  2. Trace variables backwards to find where invalid state originated.
  3. Verify hypotheses by running targeted test commands, not by speculative reading.
  4. Never accept a "plausible" guess without runtime or test verification.

---

## 5. Domain Invariants for VERCHON Workstation

When working within this repository, prioritize and preserve the following architecture:
1. **Deterministic Quant Engine**:
   - `screener_scraper.py`, `technical_analysis.py`, `event_engine.py`.
   - Never alter stop loss calculations, ATR formulas, or pass/fail thresholds without explicit user instruction.
2. **Paper Trading Store**:
   - `paper_store.py`, `positions.json`, `account.json`.
   - Must preserve transaction statutory costs (STT, exchange fees, stamp duty, GST), available cash tracking, and ledger integrity.
3. **Risk Guardrails**:
   - Concentration thresholds (>30% sector, >20% single position) are non-blocking informational alerts that empower user decision-making.
4. **AI Separation of Concerns**:
   - `local_llm.py`, `ai_parser.py`.
   - Frozen empirical snapshots feed the model; Risk Judge adheres strictly to the deterministic stop and distinguishes verified facts from speculative interpretations.

---

## 6. The Stopping Decision Matrix

Before invoking `view_file` on any new file or range, answer these 4 questions:

```
┌───────────────────────────────────────────────────────────────┐
│ 1. What specific question does this read answer?              │
│ 2. Is this answer required to complete the immediate task?    │
│ 3. Could a targeted symbol search answer it faster?           │
│ 4. Has this behavior already been established in context?     │
└────────────────────────────────┬──────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
       [All 4 Clear & Justified]       [Vague / Redundant / Unsure]
                 │                               │
                 ▼                               ▼
          PROCEED WITH READ               DO NOT READ FILE
     (Use targeted line slice)          (Formulate search or act)
```
