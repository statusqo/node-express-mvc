# Codebase Production Readiness Audit — Agent Prompt

**Use this exact prompt when starting a new agent session to audit this codebase.**

---

## Your Role

You are conducting a **production readiness audit** of a Node.js/Express e-commerce application. This codebase handles **orders, users, payments, and products**. It will be deployed to real users. Sloppy code, anti-patterns, and spaghetti are unacceptable.

The project owner has expressed frustration: previous agents have repeatedly produced code that required multiple corrections to reach obvious best practices. Simple things like "define status values in one place" were done wrong three times before being fixed. Code was confidently labeled "production ready" while containing clear anti-patterns.

**Your job is to find and report everything that is wrong. Do not assume anything is fine. Be thorough and skeptical.**

---

## Critical Context

1. **Domain sensitivity**: This app processes orders, stores user data, and integrates with payment gateways (Stripe). Bugs here can cause financial loss, data breaches, or compliance failures.

2. **Expectation mismatch**: Do not claim code is "production ready" unless you have verified it against real-world standards. The owner has lost trust in such claims.

3. **No sacred cows**: Audit everything. Report what you find. Do not skip areas because they "look ok" or because someone else wrote them.

---

## What You Must Audit

### 1. Magic Values and Duplication

- **Magic strings/arrays/numbers** defined in multiple places instead of a single source of truth
- Status values, error messages, constants, config keys repeated across files
- Examples: `["pending", "paid", "failed"]` in controller AND repo; `"USD"` hardcoded in 5 files; `SALT_ROUNDS = 10` in one file but not consistent

**Action**: List every magic value, where it appears, and where it should live (model, config, constants module).

### 2. Models — Single Source of Truth

- Any enum-like field (status, type, role) that uses `DataTypes.STRING` + `validate.isIn` instead of `DataTypes.ENUM` with values defined in the field
- Arrays or constants at the top of model files that duplicate what should be in the schema itself
- Models that don't export their allowed values for use elsewhere (forcing duplication in controllers/repos)

**Action**: For each model, check status/type/role fields. Report if they should be ENUMs, if values are duplicated, if exports are missing.

### 3. Controllers and Business Logic

- Validation logic duplicated between controller and service
- Business rules (e.g. "order can only be paid if status is pending") scattered as string comparisons instead of using model constants
- Controllers doing too much: if else chains, inline logic that belongs in services

**Action**: Map where business rules live. Report duplication and misplaced logic.

### 4. Services and Repos

- Repos with hardcoded filters, status lists, or query logic that should reference the model
- Services that re-define constants already in models
- Missing error handling, swallowed errors, or generic catch blocks that hide failures

**Action**: List every service/repo that defines its own constants. Report missing error handling.

### 5. Security and Data Handling

- Sensitive data (tokens, hashes, card details) logged, echoed in errors, or exposed in responses
- User input used in queries without validation or parameterization
- Missing or inconsistent authorization checks (e.g. admin-only routes)

**Action**: Report any potential exposure of sensitive data. Report missing auth checks.

### 6. Payment and Order Flow

- Order status transitions that could be invalid (e.g. paid → pending)
- Stripe/payment logic with magic strings for status, event types, or error codes
- Missing idempotency or race conditions in order creation or payment handling

**Action**: Trace order and payment flows. Report invalid transitions, magic values, and race risks.

### 7. Consistency and Patterns

- Inconsistent patterns: some models use ENUM, others use STRING; some errors use `err.status`, others use `err.code`
- Inconsistent naming: `userId` vs `user_id`, `createdAt` vs `created_at` in the same layer
- Files that mix concerns (e.g. controller doing SQL-like logic)

**Action**: Report inconsistencies that will cause future bugs or confusion.

### 8. Dead Code and Orphaned Logic

- Unused imports, unused functions, commented-out code
- Migrations or config that reference removed features
- Services/repos that are never called

**Action**: List dead code and orphaned references.

---

## Report Format

Produce a structured report with:

1. **Executive summary** (1–2 paragraphs): Overall health, biggest risks, top 3–5 issues to fix first.

2. **Findings by category** (use the 8 categories above):
   - For each finding: file path, line(s), description, severity (Critical / High / Medium / Low), and recommended fix.

3. **Prioritized action list**: Ordered by impact. Critical and High first.

4. **Do NOT**:
   - Fix anything unless explicitly asked
   - Claim the codebase is "mostly fine" or "generally good" without evidence
   - Skip a category because it seems ok
   - Provide vague recommendations ("consider refactoring")

5. **DO**:
   - Cite specific files and line numbers
   - Be concrete: "In `src/controllers/admin/orders.controller.js` line 4, VALID_STATUSES is duplicated; it should import from Order model"
   - Report everything you find, even if it seems minor

---

## Scope

- **Include**: `src/` (models, controllers, services, repos, routes, middlewares, gateways, validators)
- **Include**: `src/db/migrations/` for schema consistency
- **Exclude**: `node_modules/`, build artifacts, docs (unless auditing docs for accuracy)

---

## Starting the Audit

1. Read this prompt fully.
2. Explore the codebase structure.
3. Systematically audit each category.
4. Produce the report as specified.
5. Do not make edits. Report only.

---

## Reminder for the Agent

The project owner has had to correct the same type of mistake multiple times (magic arrays, wrong enum usage, duplication). They need confidence that this codebase can be deployed safely. Your job is to find problems, not to reassure. Be thorough. Be specific. Report everything.
