# NSE Swing Trading Research System

A personal research and screening system for finding **3-week to 2-month NSE swing-trading opportunities** using fundamental analysis, technical analysis, market-regime analysis, deterministic strategy rules, and AI-assisted research.

This project is **not intended to be a fully autonomous trading bot**.

The computer's job is to:

* scan the defined stock universe
* organize fundamental and technical evidence
* evaluate deterministic strategy conditions
* identify and classify potential setups
* rank and shortlist candidates for further research
* surface risks, contradictions, and research questions
* synthesize the available evidence through AI

The final research and trading decision remains **human-driven**.

---

# 1. Main Goal

The core objective is:

> **Find repeatable swing-trading opportunities by combining fundamentally interesting/improving businesses with technical confirmation, while keeping risk defined and avoiding unnecessary prediction or complexity.**

The intended holding period is approximately:

**3 weeks → 2 months**

The system is designed around:

```text
Find an interesting business
        ↓
Check fundamental characteristics
        ↓
Check technical structure and relative strength
        ↓
Check broader market environment
        ↓
Evaluate deterministic strategy conditions
        ↓
Shortlist candidates
        ↓
AI organizes and interprets the evidence
        ↓
Human researches the company
        ↓
Human makes the final decision
```

The system should **not** attempt to predict the exact future price of a stock.

Instead, it identifies situations where:

* the underlying business has interesting/improving characteristics
* price action provides technical confirmation
* the broader market environment is understood
* a defined technical risk level exists
* the setup satisfies explicit rules
* the human researcher has enough evidence to investigate further

---

# 2. Project Philosophy

## 2.1 Not an autonomous trading bot

The goal is not:

```text
Computer → BUY/SELL → Broker
```

The goal is:

```text
Computer → Scan → Qualify → Organize Evidence → Research
                                             ↓
                                           Human
                                             ↓
                                        Decision
```

The system does not place live trades.

It is a **research and decision-support system**.

---

## 2.2 Not a prediction engine

The system does not attempt to predict individual price movements with certainty.

A strategy setup means:

> The current market data satisfies a predefined set of conditions.

It does **not** mean:

> The stock will definitely rise.

The deterministic engine therefore reports what conditions are present or absent rather than assigning unsupported certainty to future outcomes.

---

## 2.3 Fundamentals + Technicals

The central philosophy is:

> **Fundamentals provide the reason to care about a company; technicals provide confirmation and timing.**

A strong business does not automatically represent a valid swing setup.

Likewise, a strong chart does not automatically represent a fundamentally interesting company.

The system therefore keeps the two analytical layers separate.

---

## 2.4 Market context matters

Individual stocks do not trade in isolation.

The system separately analyzes the broader Nifty 50 environment.

Market regime is treated as **context**, not as a mathematical prediction or automatic stock-score multiplier.

For example:

```text
Strong stock + weak market
```

is a different environment from:

```text
Strong stock + strong market
```

The current system reports the market regime alongside individual-stock analysis rather than arbitrarily multiplying stock scores by the regime score.

---

## 2.5 Avoid indicator stacking

The project deliberately avoids adding indicators simply because they are available.

For example:

```text
RSI
MACD
Stochastic
ADX
Bollinger Bands
CCI
VWAP
ATR
...
```

Every metric should have a clear purpose.

If a metric does not improve research quality, provide useful evidence, or support a deterministic rule, it does not need to exist.

---

## 2.6 Avoid unnecessary complexity

The project is intentionally not being built like a hedge fund research platform.

The preferred approach is:

```text
Simple
    ↓
Deterministic
    ↓
Interpretable
    ↓
Useful
```

rather than:

```text
More indicators
    ↓
More models
    ↓
More parameters
    ↓
More complexity
```

Complexity should only be added when it solves a real research problem.

---

## 2.7 No parameter chasing

Historical testing may eventually be useful, but the goal is not to continuously change parameters until historical results look good.

The project prioritizes:

**robustness > perfect historical performance**

---

# 3. Current Workflow

The current system operates approximately as follows:

```text
Screener
   │
   ▼
screener_scraper.py
   │
   ▼
Fundamental Data
   │
   ▼
improvedfundanalysis.py
   │
   ├─────────────────────┐
   │                     │
   ▼                     ▼
Technical Data        Market Data
   │                     │
   ▼                     ▼
techanalysis.py      marketregime.py
   │                     │
   └──────────┬──────────┘
              ▼
      Strategy Evaluation
              │
              ▼
      resultanalysis.py
              │
              ▼
       Candidate Dossiers
              │
              ▼
        aianalysis.py
              │
              ▼
      AI Research Report
              │
              ▼
       Human Research
              │
              ▼
       Human Decision
```

The deterministic strategy layer comes **before** the AI research layer.

This is intentional.

Python determines whether the explicit rules are satisfied. AI interprets and organizes the resulting evidence.

---

# 4. Current Project Structure

The active project is intentionally kept small and modular.

```text
project/

│
├── improvedfundanalysis.py
├── resultanalysis.py
├── techanalysis.py
├── marketregime.py
├── screener_scraper.py
├── aianalysis.py
│
└── old code/
    ├── old Python files
    ├── Excel files
    └── previous experiments
```

## Active files

### `screener_scraper.py`

Collects company information from Screener.

The current Screener-based pipeline provides information such as:

* financial statements
* ratios
* shareholding
* sector information
* banking-specific metrics
* valuation information
* red flags
* peer information
* filings
* insider/bulk-deal information
* other company-level information

This is the primary source feeding the current fundamental-analysis pipeline.

---

### `improvedfundanalysis.py`

The current fundamental-analysis engine.

It transforms raw company information into structured fundamental metrics and scores.

Primary categories:

| Category                      | Weight |
| ----------------------------- | -----: |
| Business Quality              |    20% |
| Growth & Earnings             |    20% |
| Financial Health              |    15% |
| Earnings Quality              |    10% |
| Current Momentum / Inflection |    20% |
| Ownership & Governance        |    10% |
| Sector / Industry             |     5% |

The resulting **Fundamental Score** is out of 100.

The analyzer is designed to be:

* company-type aware
* N/A-aware
* coverage-aware
* metric-backed
* interpretable

---

# 5. Company Archetypes

The fundamental analyzer recognizes different company types:

```text
BANK
NBFC
INSURANCE
OTHER_FINANCIAL
GENERAL
```

This prevents financial companies from being evaluated using exactly the same framework as industrial companies.

For example, banks can be evaluated using metrics such as:

* Capital Adequacy Ratio
* GNPA
* NNPA
* Provision Coverage Ratio

rather than relying primarily on generic industrial metrics such as debt/equity.

---

# 6. Fundamental Scoring Philosophy

The Fundamental Score is **not** a probability that a stock will rise.

It is a structured measurement of the company's fundamental characteristics.

## N/A is not 0

Missing data should not automatically mean the company is weak.

## N/A is not 100

Missing information should not automatically improve the company's score.

Missing information instead affects:

* data coverage
* confidence
* interpretation

---

## Data Completeness

Data completeness is reported separately from the fundamental score.

Example:

```text
Fundamental Score: 82
Data Completeness: 73%
Confidence: MEDIUM
```

This prevents a high score supported by limited information from being treated identically to a high score supported by comprehensive data.

---

# 7. Technical Analysis

`techanalysis.py` handles individual-stock technical analysis using Yahoo Finance market data.

It evaluates factors including:

* current price
* 20/50/200 DMA
* moving-average slopes
* trend structure
* relative strength versus Nifty
* multi-period returns
* volume behavior
* technical setups
* strategy conditions

The technical engine answers questions such as:

```text
Is the stock trending?

Is it outperforming the benchmark?

Is price above or below important structural levels?

Is the trend aligned with the strategy?

Is a setup forming?

Has a setup been invalidated?

Has an entry signal actually triggered?
```

Technical analysis remains separate from fundamental analysis so both modules can evolve independently.

---

# 8. Market Regime Analysis

`marketregime.py` evaluates the broader market using the **Nifty 50** as the primary benchmark.

Current V1 inputs include:

* 20 DMA
* 50 DMA
* 200 DMA
* price versus moving averages
* moving-average slopes
* 1-month return
* 3-month return
* 6-month return
* realized volatility
* breadth where reliable

The current regime model combines:

```text
Trend        45%
Momentum     30%
Volatility   25%
```

Possible regimes:

```text
SUPPORTIVE
NEUTRAL
CAUTION
HOSTILE
```

The regime describes the **current market environment according to the framework**.

It does not predict that the market will rise or fall.

The market regime is currently used as **context**, not as a direct multiplier of individual stock scores.

---

# 9. Deterministic Strategy Engine

The strategy engine is now implemented as part of the existing technical/result-analysis architecture.

A separate strategy-engine file is not currently required.

The current V1 consists of **three strategy families**.

All three share common fundamental and trend qualification rules.

---

## 9.1 Common Fundamental Qualification

A stock must satisfy:

```text
Business Quality >= 50

Growth & Earnings >= 50

Current Momentum >= 40

Data Completeness >= 60%

Confidence != LOW
```

The fundamental score is therefore used as a **qualification layer**, not as a prediction of future price movement.

---

## 9.2 Common Trend Qualification

The strategy families require:

```text
Price > 200 DMA

50 DMA > 200 DMA

50 DMA slope > 0
```

This ensures that the strategy is operating within an established upward technical structure before evaluating the individual setup.

---

# 10. Strategy 1 — Trend Pullback / Continuation

This strategy looks for an established upward trend followed by a controlled retracement and renewed strength.

### Qualification

Common fundamental + trend qualification.

The previous 10 completed sessions must contain at least one session where:

```text
Low <= 1.03 × that session's 50 DMA

AND

Low >= 0.95 × that session's 50 DMA
```

Current price must satisfy:

```text
Current Price >= Current 50 DMA
```

### Entry trigger

The signal day must satisfy:

```text
Today's Close > Previous Day's High

AND

Today's Close > Today's Open
```

### Entry

```text
Next trading day's open
```

### Stop

The stop is based on the:

```text
Most recent confirmed 2-left / 2-right swing low
```

after the pullback begins and before the signal day.

If no valid confirmed swing low exists:

```text
No trade signal
```

---

# 11. Strategy 2 — Consolidation → Breakout

This strategy looks for an established upward trend followed by a meaningful consolidation and range expansion.

### Qualification

Common fundamental + trend qualification.

The previous 20 completed sessions must satisfy:

```text
20D Range <= 12%
```

where:

```text
Range =
(Highest High - Lowest Low)
/
Lowest Low
```

Current price must be within:

```text
5% of the 20-day high
```

### Breakout trigger

The signal day must satisfy:

```text
Close > Previous 20-day High

AND

Volume >= 1.5 × average volume of previous 20 sessions

AND

Close > Open
```

### Entry

```text
Next trading day's open
```

### Stop

The stop is:

```text
Most recent confirmed 2-left / 2-right swing low
inside the consolidation
```

If no valid swing low exists:

```text
No trade signal
```

---

# 12. Strategy 3 — Relative-Strength Continuation

This strategy captures fundamentally qualified stocks displaying persistent relative strength while maintaining a constructive trend.

### Qualification

Common fundamental + trend qualification.

Relative-strength requirements:

```text
1M alpha > 0

3M alpha > 0

1M alpha >= +2%
```

The previous five completed sessions must satisfy:

```text
5D Range <= 8%

5-day low > 20-day low
```

### Entry trigger

The signal day must satisfy:

```text
Close > Previous Day's High

AND

Close > Open

AND

Volume >= average volume of previous 20 sessions
```

### Entry

```text
Next trading day's open
```

### Stop

The stop is:

```text
Most recent confirmed 2-left / 2-right swing low
during the 5-day continuation structure
```

If no valid swing low exists:

```text
No trade signal
```

---

# 13. Strategy State / Setup Classification

The strategy engine distinguishes between qualification, setup formation, invalidation, and actual signals.

Important states include:

```text
NOT_QUALIFIED
QUALIFIED
SETUP_FORMING
SIGNAL_TRIGGERED
ENTRY_PENDING
OPEN
MONITORING
SETUP_INVALIDATED
EXIT_TRIGGERED
CLOSED
```

These states should not be treated as interchangeable.

For example:

```text
Trend qualified
+
setup invalidated
=
No active trade
```

A stock can therefore be fundamentally interesting and technically qualified without having an active entry signal.

---

# 14. Risk Framework

The deterministic strategy engine includes configurable risk constraints.

## Maximum stop distance

If:

```text
Stop distance > 8% of entry reference
```

the setup is rejected.

## Entry gap protection

If the next trading day's opening price is more than:

```text
5% above the signal-day close
```

the entry is rejected.

## Position sizing

The paper-position sizing framework is based on risk rather than blindly allocating the same capital to every stock.

Conceptually:

```text
Risk Budget
    =
Portfolio Value × Risk %
```

```text
Risk Per Share
    =
Entry Price - Stop Price
```

```text
Risk-Based Quantity
    =
Risk Budget / Risk Per Share
```

The actual quantity is constrained by available capital.

This is currently a **research/paper-sizing framework** and is not connected to live order execution.

---

# 15. Exit Framework

The strategy framework contains the following exit concepts.

## 15.1 Stop

A position exits when the defined technical stop is reached.

For gap-through behavior:

```text
If opening price < stop:
    exit at opening price

Otherwise:
    exit at stop
```

---

## 15.2 Maximum holding period

Maximum intended holding period:

```text
60 completed trading sessions
```

Entry day is treated as Day 0.

---

## 15.3 Trend-failure exit

A trend-failure exit can occur when:

```text
Close < 50 DMA
for 2 consecutive sessions

AND

50 DMA slope <= 0
```

The exit occurs at the next available open.

---

## 15.4 R-multiple tracking

The system tracks:

```text
1R
2R
3R
...
```

but reaching 2R does **not automatically trigger an exit**.

R-multiple tracking is intended to help understand trade distributions rather than impose an arbitrary profit target.

---

# 16. Result Analysis

`resultanalysis.py` acts as the consolidation/reporting layer.

It combines:

```text
Fundamental Analysis
        +
Technical Analysis
        +
Strategy Evaluation
        +
Market Regime
        ↓
Consolidated Research Dossier
```

A stock dossier can contain:

* fundamental score
* fundamental confidence
* data completeness
* valuation metrics
* technical structure
* relative strength
* market regime
* strategy qualification
* setup status
* invalidation reason
* relevant technical levels
* strengths
* weaknesses
* risks
* research questions

The purpose is to turn several analytical modules into something a human can actually investigate.

---

# 17. AI Research Pipeline

`aianalysis.py` is now an active part of the system.

It operates as a **research synthesis layer**, not as the deterministic strategy engine.

The current pipeline has two stages.

```text
26-stock universe
        ↓
Deterministic screening
        ↓
Stage 1 AI Triage
        ↓
Shortlist
        ↓
Stage 2 AI Deep Synthesis
        ↓
research_report.md
```

The current system has successfully processed a 26-stock universe and produced a shortlist followed by detailed research dossiers.

---

## Stage 1 — AI Triage

The first stage receives the deterministic outputs for the stock universe and identifies a smaller group of candidates for deeper research.

The AI may use:

* fundamental characteristics
* technical structure
* strategy status
* relative strength
* valuation information
* market context
* risks and contradictions

The purpose is to reduce the research workload.

---

## Stage 2 — Deep Synthesis

The finalists receive a more detailed research synthesis.

The report can include:

* why the stock entered the shortlist
* key evidence
* fundamental contradictions
* technical contradictions
* strategy status
* research risks
* research questions
* conditions that would strengthen or weaken the research hypothesis
* cross-stock observations

The AI should **not override deterministic strategy results**.

---

# 18. AI Guardrails

The AI research layer should follow several important rules.

## Python is the source of truth for deterministic values

AI must not invent:

* technical levels
* moving-average values
* strategy statuses
* stop levels
* entry conditions
* strategy qualification
* volume thresholds
* risk limits

If Python says:

```text
Strategy: NOT QUALIFIED
Reason: 50 DMA slope <= 0
```

the AI must preserve that fact.

---

## Facts vs interpretations

The AI should distinguish between:

```text
Observed evidence
```

and:

```text
Possible interpretation
```

For example:

Good:

> Price is 6.3% below the 50 DMA.

Potential interpretation:

> This may indicate continued short-term technical weakness.

Avoid presenting unsupported explanations as facts, such as:

> Institutional investors are liquidating the stock.

unless the system actually has evidence supporting that claim.

---

## No unsupported valuation labels

The AI should avoid labels such as:

```text
Attractive valuation
Fair valuation
Cheap
Expensive
Low risk
```

unless an explicit and defensible valuation baseline is available.

Absolute P/E or P/B values should generally be reported as evidence rather than automatically converted into a qualitative valuation judgment.

---

## No invented causality

The AI should not automatically infer that a price movement was caused by:

* institutional selling
* market participants
* liquidity withdrawal
* profit-taking
* future-growth expectations
* “smart money”
* distribution

unless the available evidence supports that explanation.

When appropriate, these should be presented as **hypotheses to investigate**.

---

## No automatic BUY/SELL recommendation

The AI should not turn the research report into:

```text
BUY
SELL
GUARANTEED TARGET
```

The system's intended output is:

```text
Evidence
+
Setup status
+
Risks
+
Research questions
```

The human remains responsible for the final decision.

---

# 19. Current Research Report

The current pipeline generates:

```text
research_report.md
```

A typical report contains:

```text
Market Backdrop

        ↓

Universe Themes

        ↓

Finalist Research Dossiers

        ↓

Cross-Stock Comparison

        ↓

Common Research Questions

        ↓

Human Verification Checklist
```

The report is intended to reduce the amount of raw data the human researcher needs to manually process.

---

# 20. Human-in-the-Loop Design

The system intentionally ends with a human research stage.

A useful output should look conceptually like:

```text
ICICIBANK

Fundamentals:
Strong

Technical:
Currently weak / no confirmed setup

Market:
Hostile

Strategy:
Not qualified

Why it is still interesting:
Strong fundamental characteristics

Current problem:
Technical confirmation is missing

Research questions:
- Is earnings growth sustainable?
- What is the NIM trajectory?
- Are asset-quality metrics changing?
- What technical conditions would qualify the stock?
```

This is more useful than:

```text
BUY ICICIBANK
```

because it tells the researcher:

**why the stock is worth investigating, what the current system says, and what remains unresolved.**

---

# 21. Backtesting Status

**Backtesting is intentionally not the current development priority.**

The current system is a **current-market research scanner**, not a historical backtesting engine.

The current workflow is:

```text
Current market data
        ↓
Current fundamental data
        ↓
Current technical analysis
        ↓
Current strategy qualification
        ↓
Current research report
```

It is **not**:

```text
2019 → simulate trade
2020 → simulate trade
2021 → simulate trade
...
```

No backtesting engine is currently required for the present V1 research workflow.

---

## Future Backtesting

A backtester may eventually be useful for determining:

* how frequently setups occurred historically
* historical winner/loser distributions
* average holding periods
* drawdowns
* behavior under different market regimes
* whether the strategy rules have historical evidence

However, this should be treated as a **future validation tool**, not as the current purpose of the project.

---

# 22. Backtesting Data Limitation

If historical backtesting is introduced later, one major limitation must be handled carefully:

**point-in-time fundamental data.**

Current Screener fundamentals represent current/available company information rather than a perfect historical snapshot of exactly what was known on every historical trading day.

Therefore, using today's fundamental data to simulate historical fundamental decisions can introduce look-ahead bias.

For example:

```text
Current fundamental score
        ↓
pretend it was known in 2019
        ↓
simulate 2019 trade
```

would not represent a fully valid historical information set.

Technical historical data can generally be reconstructed more cleanly, but fundamental backtesting requires appropriate historical point-in-time data.

If a backtester is eventually built, this limitation must be explicitly documented.

---

# 23. Old Code

The `old code/` folder contains:

* previous Python versions
* experiments
* Excel datasets
* historical implementations

These files are retained for:

* reference
* comparison
* recovering useful logic
* understanding previous development

They are **not part of the current production architecture**.

Current code should not depend on files inside `old code/` unless explicitly intended.

Old code should not be modified casually.

---

# 24. Current Architecture

The current active architecture is intentionally compact:

```text
                 SCREENER
                    │
                    ▼
          screener_scraper.py
                    │
                    ▼
        improvedfundanalysis.py
                    │
                    │
Yahoo Finance ──────┤
                    ▼
             techanalysis.py
                    │
                    │
Nifty 50 ───────────┤
                    ▼
             marketregime.py
                    │
                    ▼
        Strategy Evaluation
                    │
                    ▼
            resultanalysis.py
                    │
                    ▼
          Candidate Dossiers
                    │
                    ▼
             aianalysis.py
                    │
                    ▼
        AI Research Report
                    │
                    ▼
           Human Research
```

The architecture deliberately avoids creating an additional strategy module unless the existing architecture genuinely requires one.

---

# 25. Module Responsibilities

| Module                    | Responsibility                                                    |
| ------------------------- | ----------------------------------------------------------------- |
| `screener_scraper.py`     | Collect current company/fundamental information                   |
| `improvedfundanalysis.py` | Fundamental analysis and scoring                                  |
| `techanalysis.py`         | Stock-level technical analysis and deterministic setup evaluation |
| `marketregime.py`         | Nifty 50 market environment                                       |
| `resultanalysis.py`       | Consolidation, strategy output, and research dossier              |
| `aianalysis.py`           | AI triage and research synthesis                                  |
| `old code/`               | Historical/reference material only                                |

The system should preserve these boundaries.

---

# 26. Current Development Status

```text
Phase 1    Fundamental Data Pipeline        ✅
Phase 2    Fundamental Analyzer             ✅
Phase 3    Market Data Pipeline              ✅
Phase 4    Technical Analyzer                ✅
Phase 5    Sector Analysis                   ✅
Phase 6    Stock Selection / Ranking        ✅
Phase 7    Market Regime                    ✅
Phase 8    Strategy Definition              ✅
Phase 9    Deterministic Strategy Engine    ✅ V1
Phase 10   AI Research Pipeline             ✅ V1
Phase 11   Research Report / Dossiers       ✅ V1

Phase 12   AI Guardrail / Quality Cleanup   → NEXT
Phase 13   Research Queue / Workflow        ⏳
Phase 14   Event / Earnings Context         ⏳
Phase 15   Ongoing Research History         ⏳

Phase 16   Historical Backtesting            ⏳ FUTURE
Phase 17   Backtest Validation               ⏳ FUTURE
Phase 18   Performance Analysis              ⏳ FUTURE
Phase 19   Position Sizing Refinement        ⏳ FUTURE
Phase 20   Portfolio / Risk Monitoring       ⏳ FUTURE
Phase 21   Trade Journal + Analytics         ⏳ FUTURE
Phase 22   Dashboard / Live Workflow         ⏳ FUTURE
```

The exact phase numbering is less important than the principle:

> **Do not add complexity until the current layer has demonstrated a real research need.**

---

# 27. Current Priority

The deterministic strategy engine is now considered **V1 complete**.

The three strategy families are:

```text
1. Trend Pullback / Continuation

2. Consolidation → Breakout

3. Relative-Strength Continuation
```

The next development focus is **not another strategy**.

The next focus is making the research output more useful.

Priority order:

```text
Strategy Engine
      ↓
      DONE
      ↓
AI Research Quality
      ↓
Research Queue
      ↓
Event / Earnings Context
      ↓
Ongoing Research History
      ↓
Observe the system
      ↓
Only then consider larger additions
```

The AI layer should be cleaned up so that it:

* separates facts from hypotheses
* avoids unsupported causal claims
* avoids unsupported valuation judgments
* preserves deterministic strategy results
* produces clear research questions
* makes the report easier for a human to act on intellectually

The research workflow should eventually make it easy to answer:

```text
What should I investigate today?

Why did the system surface this stock?

What evidence supports the interest?

What is currently preventing a setup?

What information is still missing?

What changed since the previous scan?
```

---

# 28. What the System Should Eventually Become

The long-term goal is not:

```text
Huge Quant System
        +
Hundreds of Indicators
        +
Black-Box Prediction Model
        +
Automatic Trading
```

The intended system is closer to:

```text
                 Market Universe
                       │
                       ▼
                Data Collection
                       │
             ┌─────────┴─────────┐
             ▼                   ▼
        Fundamentals         Technicals
             │                   │
             └─────────┬─────────┘
                       ▼
                 Market Regime
                       │
                       ▼
              Strategy Evaluation
                       │
                       ▼
                Candidate List
                       │
                       ▼
                AI Research
                       │
                       ▼
              Research Questions
                       │
                       ▼
                Human Research
                       │
                       ▼
              Human Decision
```

The computer handles the repetitive analytical work.

The human handles judgment, context, and the final decision.

---

# 29. Design Principles

Any future change to the project should follow these principles.

## Principle 1 — Keep modules separate

Fundamentals should not become mixed with technical calculations.

Technical analysis should not become mixed with portfolio management.

Market regime should remain a separate concept.

AI should not replace deterministic calculations.

---

## Principle 2 — Prefer interpretable metrics

A human should be able to understand why a stock received a particular score or strategy status.

---

## Principle 3 — Missing data should remain visible

Do not silently convert missing information into favorable or unfavorable values.

---

## Principle 4 — Preserve raw evidence

Scores should be accompanied by the underlying metrics whenever possible.

For example:

```text
ROE: 18.4%
5Y Profit CAGR: 28.5%
GNPA: 2.1%
NNPA: 0.4%
CAR: 16.8%
```

is more useful than:

```text
Financial Health: 83
```

alone.

---

## Principle 5 — Deterministic rules stay deterministic

Strategy qualification should be performed by code using explicit rules.

AI should not reinterpret a failed rule into a successful one.

---

## Principle 6 — AI explains; it does not invent

AI can identify relationships, summarize evidence, generate research questions, and highlight contradictions.

It should not invent facts, technical levels, strategy signals, or unsupported explanations.

---

## Principle 7 — Don't overengineer

If a simple implementation answers the research question, use the simple implementation.

---

## Principle 8 — Don't optimize for pretty backtests

If historical testing is eventually performed, the objective is to understand robustness and behavior, not manufacture an impressive historical result.

---

## Principle 9 — Human decision remains the final layer

The project is a **research and decision-support system**, not an autonomous trader.

---

# 30. Current System Boundary

The current project intentionally does **not** attempt to solve everything.

Not currently included:

```text
❌ Live broker execution
❌ Autonomous trading
❌ Price prediction model
❌ Guaranteed price targets
❌ Fully automated fundamental due diligence
❌ Historical point-in-time fundamental database
❌ Large-scale portfolio optimizer
❌ Complex ML prediction system
❌ Endless indicator stacking
```

These are not necessarily permanent exclusions, but none are required for the current V1 research system.

---

# 31. One-Sentence Project Definition

> **A modular NSE swing-trading research system that combines fundamental business analysis, technical confirmation, deterministic strategy evaluation, and market-regime context to identify and investigate 3-week-to-2-month opportunities, with AI used to organize and interpret evidence while the final decision remains human-driven.**

---

# 32. Final Rule

When deciding whether to add something to this project, ask:

> **Does this improve the quality of the research decision, or am I just adding complexity because I can?**

If it improves research quality, consider it.

If it only makes the system more complicated, leave it out.
