# A2A Overture — Proposal for Official Recognition

## To: A2A Protocol Working Group

### Subject: Establishing A2A Overture as the Reference Compliance Testing Tool

---

## Executive Summary

A2A Overture is an open-source compliance testing toolkit purpose-built for the A2A (Agent-to-Agent) protocol. We propose that the A2A working group officially recognize A2A Overture as a reference implementation for protocol compliance testing, benefiting the entire A2A ecosystem.

## The Problem

As the A2A protocol gains adoption, implementers face a common challenge: **How do I know my agent is truly A2A-compliant?**

Without an official testing tool:
- Each implementer writes ad-hoc tests, wasting effort
- Interoperability issues surface only in production
- "A2A compatible" claims are unverifiable
- New implementers have no fast feedback loop during development

## What A2A Overture Provides

### 1. Comprehensive Compliance Test Suite (23 tests, 100% v1.0 coverage)

| Category | Tests | Coverage |
|----------|-------|----------|
| Agent Card | 5 tests | Discovery, schema, required fields, skills, HTTPS |
| Core Operations | 5 tests | SendMessage, GetTask, CancelTask, ListTasks, errors |
| Streaming | 2 tests | SSE streaming, SubscribeToTask |
| Multi-turn | 3 tests | contextId, taskId continuation, history |
| Push Notifications | 5 tests | Capability, rejection, set/get/delete config |
| Protocol | 1 test | A2A-Version header |
| Security | 2 tests | Auth enforcement, security scheme validation |

### 2. Developer Tools
- **CLI** (`overture certify <url>`) — one-command compliance check
- **Mock Server** — reference A2A agent for testing client implementations
- **Web UI** — browser-based testing dashboard
- **JSON/HTML Reports** — machine-readable and shareable compliance results
- **SVG Badges** — "A2A Certified" badges for READMEs

### 3. CI/CD Integration
- **GitHub Action** — automated compliance checking in pull requests
- **Exit codes** — fail builds when compliance breaks

### 4. Public Compliance Registry
- Agents can publish and share their compliance results
- Searchable directory of certified A2A agents
- Dynamic badge generation for each registered agent

## Proposed Relationship

### What We're Requesting

1. **Reference in Documentation**: A mention in the A2A specification documentation as a recommended testing tool, similar to how HTTP specs reference tools like `curl` for examples.

2. **Feedback Channel**: Direct access to spec drafts and RFCs before publication, so we can prepare tests for new features before they're finalized.

3. **"Recommended by A2A" Status**: Permission to use language indicating official recommendation on the project README and documentation.

### What We Offer

1. **Test Suite Maintenance**: We will maintain test coverage for every new spec version within 30 days of publication.

2. **Spec Validation**: Our test suite serves as an executable specification — if a feature can't be tested, the spec may need clarification.

3. **Community Tooling**: All tools remain open-source (Apache 2.0), free for the community.

4. **Compliance Registry**: We will operate a public registry where agents can publish their compliance status, increasing ecosystem visibility.

5. **Bug Reports**: Through compliance testing, we discover spec ambiguities and edge cases that improve the specification itself.

## Technical Details

- **Language**: TypeScript/Node.js (cross-platform)
- **License**: Apache 2.0
- **Dependencies**: Minimal (no heavy frameworks)
- **Distribution**: npm package + GitHub Action
- **Spec Coverage**: Version-tracked feature map with automated coverage reporting

## Specification Coverage Tracking

A2A Overture includes a built-in spec version tracker that maps every protocol feature to specific compliance tests:

```
A2A v1.0 Specification Coverage
══════════════════════════════════════
  Total features:  23
  Covered:         23 ✅
  Partial:          0 ⚠️
  Uncovered:        0 ❌
  Coverage:       100%
```

As new spec versions are released, we will:
1. Add new features to the tracking manifest
2. Implement corresponding compliance tests
3. Mark features as covered/partial/uncovered
4. Publish updated coverage reports

## Adoption Path

### Phase 1 — Community Recognition
- A2A website lists Overture as a recommended testing tool
- Working group members use Overture during spec development

### Phase 2 — Reference Status
- Spec documentation includes Overture test IDs alongside feature descriptions
- New spec features include corresponding Overture test requirements

### Phase 3 — Certification Program
- "A2A Certified by Overture" becomes the standard compliance mark
- Public registry serves as the official directory of compliant agents
- Annual re-certification ensures ongoing compliance

## Contact

- **Repository**: [GitHub — A2A Overture](https://github.com/a2a-overture)
- **License**: Apache 2.0
- **Spec Version**: A2A v1.0 (100% coverage)

---

*A2A Overture — The opening act for your A2A agents*
