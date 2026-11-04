# Architecture

## System

```mermaid
flowchart LR
  subgraph A["Browser A"]
    EA["Monaco + y-monaco"] --- DA["Y.Doc<br/>code · chat · meta"]
    UA["Timeline · Time-travel diff<br/>Debugger panel"]
  end
  subgraph B["Browser B"]
    EB["Monaco + y-monaco"] --- DB["Y.Doc"]
  end
  DA <== "WebRTC data channel (Yjs updates)" ==> DB
  subgraph S["Node server (one port)"]
    SIG["signaling / relay (ws)"]
    API["/api/* debugger routes<br/>CORS · access code · rate limits"]
    POL["execution policy<br/>(hash allowlist)"]
    STORE[("checkpoints<br/>JSON per room · volume")]
    REG["regression<br/>bisect + verify"]
    RUN["runner → child process<br/>permission model · empty env · SIGKILL"]
    AN["analysis<br/>prompt · schema · validation"]
  end
  META["Meta Model API<br/>muse-spark-1.3 · json_schema"]
  DA <-.-> SIG
  DB <-.-> SIG
  UA -- "HTTP" --> API
  API --> STORE
  API --> POL
  POL --> REG --> RUN
  POL --> AN --> META
  API -- "verify(analysisId)" --> RUN
```

- **Collaboration** is unchanged from the original PeerCode: a Yjs CRDT over WebRTC, with a server relay that forwards updates and never stores them.
- **Checkpoints** are explicit full snapshots, stored on the server with a server-assigned sequence number and a SHA-256 hash. When anyone checkpoints, a counter in the shared `Y.Map` changes and every peer refetches.
- **Time travel** opens read-only Monaco diff models. They're never bound to the live `Y.Text`.

## The debugging pipeline

```mermaid
sequenceDiagram
  participant U as User (UI)
  participant S as Server
  participant R as Runner (child process)
  participant M as Muse Spark
  U->>S: POST /regression {challengeId}
  S->>S: policy: every checkpoint in range allowlisted?
  loop bisect, then backward verify (cached by hash)
    S->>R: run tests on checkpoint
    R-->>S: passed / failed / error(kind)
  end
  S-->>U: last passing #2, first failing #3, failing cases
  U->>S: POST /analyze {lastPassingId, firstFailingId, currentCode}
  S->>S: policy: all three allowlisted (prompt = server-owned text only)
  S->>M: diff + full suite status + failing inputs + driver + current code<br/>response_format: json_schema (strict)
  M-->>S: {failedBehavior, whatChanged, probableRootCause, explanation, edits[], confidenceNotes}
  S->>S: validate schema · edits apply uniquely · screen tokens
  S-->>U: analysis + analysisId
  U->>S: POST /verify {analysisId}
  S->>R: run tests on patched copy
  R-->>S: 5/5 (or 8/8)
  S->>S: allowlist the verified patched code
  S-->>U: Tests passed
  U->>U: Apply only if live code == verified source (re-checked on click)
  U->>U: minimal edit into the shared Y.Text, then a new checkpoint
```

## Trust boundary (what may execute)

```mermaid
flowchart TB
  V["Visitor-written code<br/>(editor, checkpoints, request bodies)"] -- "stored only" --> X(("never executed<br/>(restricted mode)"))
  T["Built-in scenario code<br/>(server-owned)"] --> AL{{"SHA-256 allowlist"}}
  P["Model edits on allowlisted code<br/>(prompt contains no visitor text)<br/>+ token screen"] --> V2["verify"] -- "passed" --> AL
  AL --> RUN["runner child process<br/>no fs writes · no subprocess/workers · no env · no eval<br/>64 MB · per-case + wall timeouts<br/>⚠ outbound network NOT blocked"]
```

`EXECUTION_MODE=local` removes the allowlist, for a developer's own machine only. The server refuses to start with it on Railway or Render. If the startup self-check finds the child-process restrictions aren't enforced, execution is disabled entirely.

## Key decisions
| Decision | Why | Trade-off |
|---|---|---|
| Snapshots, not Yjs updates, as checkpoints | Meaningful, exact, diffable units; independent of CRDT internals | Storage (capped: 200 × 50 KB per room, 2,000 rooms) |
| Bisect, then backward linear verification | O(log n) when the failing tail is short; exact for "the failure that persists to the head" | Long failing tails cost about as much as a linear scan; flips before the boundary can go unseen (Full scan exists for that) |
| Strict `json_schema` + server validation | Decoding is constrained to the schema; validation also checks what a schema can't (`find` occurs exactly once) | One retry, and a `json_object` fallback if a schema is ever rejected |
| Find/replace edits instead of unified diffs | Unambiguous: an edit either applies exactly or is rejected | Can't express moves; fine for minimal fixes |
| Verification bound to exact source; apply re-checked on click | A test result is evidence only about the code it ran on | A collaborator's edit blocks apply until it's undone (public) or re-verified (local) |
| Hash allowlist instead of a sandbox | Railway offers no verifiable container/network isolation; a JS-level sandbox can't be trusted | Visitors can't run their own code on the public demo |
| Deterministic async tests (deferred promises, microtask flush) | Race conditions tested without timers or sleeps | Scenarios are scripted by the challenge author |
