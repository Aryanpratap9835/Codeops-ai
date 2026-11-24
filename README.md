# CodeOps — Repository Intelligence & Static Analysis Platform

CodeOps is an autonomous, standalone repository intelligence, static analysis, and security platform designed to inspect local codebases, understand architectural structure, track deep dependency and call graphs, identify structural hotspots, detect security vulnerabilities, run quality gates, serve an interactive dashboard, and provide AI-powered root cause analysis and automated remediation diffs.

---

## Complete Capabilities (Milestones 1 – 9)

### Milestone 1 — Advanced Static Analysis
* **Comprehensive Import & Export Analysis**:
  * Static imports (`import { a } from "./mod"`, `import def from "./mod"`, `import * as ns from "./mod"`).
  * Dynamic imports (`await import("./plugin")`) tracked as dynamic-import edges.
  * Re-exports (`export * from "./mod"`, `export * as ns from "./mod"`, `export { a as b } from "./mod"`).
  * Default exports and default re-exports (`export default fn`, `export { fn as default }`).
  * Type-only imports and exports (`import type { T }`, `export type { T }`, `export interface`).
* **Advanced Dependency & Module Resolution**:
  * Resolves relative paths (`./`, `../`), index files, and supported extensions (`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, etc.).
  * Full TypeScript `tsconfig.json` path alias and `baseUrl` resolution.
  * Cycle-safe traversal with memoized recursion guards to prevent infinite loops in circular re-export chains.
  * Strict isolation: external package specifiers (`express`, `react`, `node:fs`) are never classified as local files.
* **Call Graph Resolution**:
  * Resolves intra-file function and arrow-function calls.
  * Resolves imported function calls across multi-level re-export chains.
  * Resolves aliased imported calls (`import { fn as alias }`).
  * Statically resolves namespace function calls (`import * as math from "./math"; math.add()`).
  * Resolves class method invocations (`this.method()`).
  * Clear categorization of `resolved`, `unresolved`, `ambiguous`, and `external` calls with transparent reasons.
* **Graph Algorithms**:
  * Directed dependency graph with distinct edge types (`imports`, `dynamic-imports`, `re-exports`).
  * Cycle detection via DFS back-edges.
  * Tarjan's strongly connected components (SCC) algorithm.
  * Reverse dependency calculation and transitive dependency closure.

### Milestone 2 — Repository Intelligence Engine
* **Architecture Detection**:
  * Heuristic classification into standard layers: `controllers`, `routes`, `services`, `repositories`, `models`, `middleware`, `utilities`, `config`, `tests`, `components`, and `unclassified`.
  * Multi-evidence reporting with confidence levels (`high`, `medium`, `low`).
  * Inter-layer dependency matrix and organizational smell detection.
* **Module Coupling Analysis**:
  * Per-module fan-in and fan-out calculation.
  * Robert C. Martin's Instability Metric: $I = \frac{\text{fanOut}}{\text{fanIn} + \text{fanOut}}$ (0 = stable, 1 = unstable).
  * Dependency concentration ratio based on destination directory distribution.
  * Identification of structural hub modules, excessive dependency sinks, and central modules.
* **Dependency Health Analysis**:
  * Overall health score (0–100) and status (`healthy`, `warning`, `critical`).
  * Unresolved local import detector (distinguishing broken local paths from valid external npm packages).
  * Fragility detection: structural bottlenecks and deep dependency chains.
* **Advanced Change Impact Analysis**:
  * Given a changed file or symbol, identifies direct dependents and transitive dependents.
  * Calculates maximum impact depth (BFS distance).
  * Identifies affected functions across files using the call graph.
  * Generates plain-English explanations for each impacted module.
* **Architecture Violation Detection**:
  * Configurable rule engine with default architectural constraints:
    * Controllers must not directly access database repositories (must use services).
    * Models must not depend on controllers or services.
    * Generic utilities must not depend on application layers.
    * Production application code must never import from test files.
    * UI components must not directly import database repositories.
  * False-positive suppression on unclassified or low-confidence modules.
* **Hotspot Scoring Engine**:
  * Transparent multi-factor risk score (0–100) factoring coupling, circularity, unresolved calls, syntax diagnostics, and module size.

### Milestone 3 — Developer Experience & CLI
* **Command Suite**:
  * `codeops analyze <path> [--json]`
  * `codeops architecture <path> [--json]`
  * `codeops dependencies <path> [--json]`
  * `codeops impact <path> <file> [--json]`
  * `codeops hotspots <path> [--json]`
  * `codeops health <path> [--json]`
  * `codeops explain <path> <file> [--json]`
  * `codeops help`
* **Strict JSON Compatibility**:
  * Clean stdout when `--json` is supplied, ensuring zero log pollution for `JSON.parse`.
  * Stable versioned schema (`1.0.0`).
* **Actionable Recommendations**:
  * Context-aware remediation advice for cycles, broken paths, architecture violations, and hotspots.

### Milestone 4 — Security Intelligence Engine
* **Secret Detection**:
  * High-entropy string analysis (Shannon entropy > 3.0) and regular expression scanning for API keys (AWS, GitHub, Slack, Generic), JWT tokens, and private keys.
  * Automatic redaction of sensitive credentials in reports to prevent accidental disclosure.
* **Injection Vulnerability Detection**:
  * SQL injection detection for unparameterized queries and template literal concatenations.
  * Command injection detection for `child_process.exec`, `execSync`, and dynamic shell commands.
  * Cross-Site Scripting (XSS) detection for React `dangerouslySetInnerHTML` and `innerHTML` assignments.
  * Path traversal detection for unvalidated file path operations (`fs.readFile`, `path.join`).
* **Insecure Cryptography & Authentication**:
  * Weak hashing algorithms (`md5`, `sha1`).
  * Hardcoded passwords, fallback credentials, and disabled SSL verification (`rejectUnauthorized: false`).
* **Security Scoring**:
  * Weighted security score (0–100) and letter grades (A through F).

### Milestone 5 — Advanced Code Intelligence
* **Control Flow Graph (CFG) Analysis**:
  * Block-level CFG generation with branch edges, loop edges, and unreachable code detection following returns, throws, or breaks.
* **Data Flow & Def-Use Analysis**:
  * Tracking variable declarations, assignments, and reads across scopes to identify unused definitions.
* **Source-to-Sink Taint Tracking**:
  * Taint tracking for untrusted inputs (`req.body`, `req.query`, `process.argv`) propagating through assignments and binary expressions into dangerous execution sinks.
  * Support for sanitizers (`sanitize`, `escape`, `encodeURIComponent`, `Number()`, `parseInt()`) that neutralize taint.
* **Code Duplication & Complexity Metrics**:
  * Structural code clone detection using rolling hash fingerprints.
  * Cyclomatic Complexity calculation based on control decision points.
  * Maintainability Index (MI) calculated from Halstead volume, cyclomatic complexity, and lines of code.

### Milestone 6 — Incremental Analysis & Caching
* **Incremental Cache Engine**:
  * SHA-256 content hashing of source files and dependency graph manifests.
  * Persistent caching in `.codeops-cache/` with dependency-aware invalidation.
* **Profiler & Cache Management**:
  * `codeops profile <path>` to benchmark execution time across scan, parse, graph, security, and intelligence phases.
  * `codeops cache clear <path>` to invalidate and reset cached manifests.

### Milestone 7 — Professional Developer Workflow
* **Local Git Integration**:
  * Inspects unstaged, staged, and branch changes (`git status`, `git diff`) without requiring external network access or platform APIs.
* **Configurable Quality Gates**:
  * Deterministic pass/fail checks based on security findings, circular dependencies, and architectural violations.
  * Configurable severity thresholds (`--fail-on critical|high|medium`).
* **OASIS SARIF 2.1.0 Exporter**:
  * Generates standard SARIF JSON output (`--sarif`) for automated CI/CD integration.
* **CI Quality Command**:
  * `codeops check <path> [--base <branch>] [--json] [--fail-on <severity>]` with proper exit codes (0 for pass, 1 for gate failure).

### Milestone 8 — Web Dashboard & REST API
* **Interactive Web Dashboard**:
  * Zero-dependency embedded web server running on Node.js standard library.
  * Interactive dark-mode dashboard displaying:
    * Repository overview & health metrics cards.
    * Layer architecture distribution and violation inspector.
    * Embedded SVG circular dependency graph visualization.
    * Security findings with severity badges and remediation hints.
    * Hotspot risk rankings with factor breakdowns.
    * Interactive change impact simulator.
    * Historical scan timeline tracking health and security score trends across runs.
* **REST API Endpoints**:
  * `GET /` & `GET /dashboard` — Serves the interactive HTML/JS dashboard.
  * `GET /api/overview` — Full repository report with dependency graph.
  * `GET /api/architecture` — Architecture layers, classified files, and cross-layer issues.
  * `GET /api/dependencies` — Directed dependency graph and health metrics.
  * `GET /api/security` — Security findings, severity distributions, and grade.
  * `GET /api/hotspots` — Ranked risky modules and contributing factors.
  * `GET /api/impact?file=<path>` — Direct and transitive impact analysis for a file.
  * `GET /api/history` — Historical scan records and score evolution.
* **CLI Command**:
  * `codeops serve <path> [--port <number>]`

### Milestone 9 — AI-Powered Repository Intelligence
* **Model Provider Abstraction**:
  * Pluggable provider interface (`ModelProvider`) with built-in offline `MockModelProvider` for testing, air-gapped environments, and deterministic CI operation.
* **Context Retrieval Engine (RAG)**:
  * Intelligent context extraction gathering AST nodes, call hierarchy, related findings, and file snippets.
  * Strict token bounding (approx 4 chars/token) with safe truncation of least relevant code.
* **AI Safety Guards**:
  * Prompt injection sanitization: strips delimiters and jailbreak attempts (`ignore all previous instructions`, `<|im_start|>`, etc.).
  * Automatic secret redaction: masks credentials and tokens before they are included in model prompts.
  * Diff patch validation: rejects patches attempting directory escapes (`..`) or introducing dangerous execution sinks (`eval`, dynamic commands).
* **Automated Fix Generation**:
  * Proposes safe remediation unified diffs for vulnerabilities (e.g., parameterizing SQL queries, replacing hardcoded credentials with `process.env`).
  * Safety verification without silent file writes — proposals are emitted as unified diffs for developer review.
* **AI Code Review**:
  * Combined deterministic and heuristic code review of git working tree changes.
  * Generates line-level comments with severity, rule ID, and actionable suggestions.
* **CLI Commands**:
  * `codeops ai explain <path> <finding-id> [--json]`
  * `codeops ai fix <path> <finding-id> [--json]`
  * `codeops ai review <path> [--base <branch>] [--json]`

---

## Installation & Setup

### Prerequisites
* Node.js >= 18.0.0
* npm or pnpm

### Build & Run
```bash
# Clone the repository
git clone https://github.com/Aryanpratap9835/Codeops-ai.git
cd Codeops-ai

# Install dependencies
npm install

# Run TypeScript compilation
npm run build

# Run the complete test suite (173 tests across 19 suites)
npm test
```

---

## CLI Usage Reference

### Repository Analysis
```bash
# Human-readable terminal report
node dist/index.js analyze ./test-repo

# Strict machine-readable JSON
node dist/index.js analyze ./test-repo --json

# SARIF 2.1.0 output for CI
node dist/index.js analyze ./test-repo --sarif
```

### Architecture & Dependencies
```bash
# Architecture layers & violations
node dist/index.js architecture ./test-repo

# Dependency graph & cycles
node dist/index.js dependencies ./test-repo

# Dependency health metrics
node dist/index.js health ./test-repo
```

### Hotspots & Change Impact
```bash
# Ranked repository hotspots
node dist/index.js hotspots ./test-repo

# Blast radius impact analysis of a file
node dist/index.js impact ./test-repo src/services/user.ts
```

### Security & CI Quality Gates
```bash
# Security scan for secrets, injection, and crypto flaws
node dist/index.js security ./test-repo

# CI quality gate check on local git changes
node dist/index.js check ./test-repo --fail-on high
```

### Profiling & Performance
```bash
# Performance profiling & cache efficiency
node dist/index.js profile ./test-repo

# Clear analysis cache
node dist/index.js cache clear ./test-repo
```

### Web Dashboard
```bash
# Launch interactive dashboard at http://localhost:3000
node dist/index.js serve ./test-repo --port 3000
```

### AI-Powered Intelligence
```bash
# Explain root cause and fix for a finding
node dist/index.js ai explain ./test-repo <finding-id>

# Generate a unified diff fix proposal
node dist/index.js ai fix ./test-repo <finding-id>

# Run automated AI code review on local git changes
node dist/index.js ai review ./test-repo --json
```

---

## Project Architecture

```
src/
├── cli/                        # CLI command runner, formatters, configuration & schema
│   ├── cli-runner.ts
│   ├── cli-types.ts
│   ├── config.ts
│   └── formatters.ts
├── core/
│   ├── ai/                     # AI engine: providers, RAG retrieval, diff generator, reviewer, safety
│   │   ├── ai-safety.ts
│   │   ├── ai-types.ts
│   │   ├── code-reviewer.ts
│   │   ├── context-retriever.ts
│   │   ├── explanation-engine.ts
│   │   ├── fix-generator.ts
│   │   ├── index.ts
│   │   └── mock-provider.ts
│   ├── analyzer/               # Metrics, risk analysis, dead code & hotspot detectors
│   │   ├── analysis-types.ts
│   │   ├── dead-code-analyzer.ts
│   │   ├── hotspot-analyzer.ts
│   │   ├── metrics-analyzer.ts
│   │   ├── risk-analyzer.ts
│   │   └── semantic-analyzer.ts
│   ├── architecture/           # Layer detection & architecture reporting
│   │   ├── architecture-detector.ts
│   │   └── architecture-types.ts
│   ├── cache/                  # Incremental caching, content hashing & performance profiler
│   │   ├── cache-manager.ts
│   │   ├── cache-types.ts
│   │   └── profiler.ts
│   ├── call-graph/             # Call extraction, call resolution & call graph analysis
│   │   ├── call-graph-analysis.ts
│   │   ├── call-graph-builder.ts
│   │   ├── call-graph-types.ts
│   │   └── call-resolver.ts
│   ├── coupling/               # Module coupling, instability & hub pattern detection
│   │   ├── coupling-analyzer.ts
│   │   └── coupling-types.ts
│   ├── graph/                  # Dependency graph, module resolution, cycles & SCCs
│   │   ├── graph-analysis.ts
│   │   ├── graph-builder.ts
│   │   ├── graph-type.ts
│   │   └── module-resolver.ts
│   ├── health/                 # Dependency health score, unresolved imports & bottlenecks
│   │   ├── dependency-health.ts
│   │   └── health-types.ts
│   ├── intelligence/           # CFG, data flow, taint tracking, duplication & cyclomatic complexity
│   │   ├── cfg.ts
│   │   ├── complexity.ts
│   │   ├── data-flow.ts
│   │   ├── duplication.ts
│   │   ├── intelligence-types.ts
│   │   └── taint-analysis.ts
│   ├── parser/                 # TypeScript Compiler AST parsing & symbol extraction
│   │   ├── ast-extractor.ts
│   │   ├── parser-types.ts
│   │   ├── parser.ts
│   │   └── symbol-extractor.ts
│   ├── repository/             # Repository file scanner & ignore filters
│   │   ├── file-filter.ts
│   │   └── scanner.ts
│   ├── rules/                  # Configurable rule engine & architectural rules
│   │   ├── analysis-engine.ts
│   │   ├── architecture-violation.rule.ts
│   │   ├── call-resolution.rule.ts
│   │   ├── circular-dependency.rule.ts
│   │   ├── file-risk.rule.ts
│   │   ├── rule-engine.ts
│   │   └── unused-symbol.rule.ts
│   ├── security/               # Secret scanning, injection detectors & crypto/auth checks
│   │   ├── detectors/
│   │   │   ├── auth-crypto-detector.ts
│   │   │   ├── injection-detector.ts
│   │   │   └── secret-detector.ts
│   │   ├── security-engine.ts
│   │   └── security-types.ts
│   └── workflow/               # Git integration, quality gates & SARIF 2.1.0 exporter
│       ├── git-integration.ts
│       ├── quality-gates.ts
│       ├── sarif-exporter.ts
│       └── workflow-types.ts
├── server/                     # Web dashboard server, REST API router & HTML UI
│   ├── api-router.ts
│   ├── dashboard-ui.ts
│   ├── index.ts
│   ├── server-types.ts
│   └── server.ts
├── index.ts                    # Main CLI entrypoint
└── shared/index.ts             # Shared exports
```

---

## Configuration (`codeops.config.json`)

You can place a `codeops.config.json` at the root of any repository analyzed by CodeOps:

```json
{
  "thresholds": {
    "excessiveFanOut": 8,
    "highCoupling": 50,
    "maxHotspotScore": 70
  },
  "architectureRules": [
    {
      "id": "arch-controller-to-repository",
      "enabled": true
    },
    {
      "id": "arch-app-to-test",
      "enabled": true
    }
  ]
}
```

---

## Quality & Verification Status

* **TypeScript Compilation**: `npx tsc --noEmit` exits with code 0 (zero errors, strict mode).
* **Test Suite**: 173 passing Vitest tests across 19 test suites with zero failures.
* **Deterministic Execution**: All commands operate 100% locally on file systems and git working trees without external network dependencies.
* **Clean Stdout**: `--json` output is pure and directly parseable with `JSON.parse`.
