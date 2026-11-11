---
name: smart-loop
description: Review a change with the internal bifrost/smart model in a loop until it approves. Use when the user says "smart loop" or asks for an internal-model review loop before filing or merging.
---

# smart loop

Make code changes more correct before (or after) filing a pull request, by
having an independent reviewer — the internal bifrost `smart` model at low
thinking, run with read-only tools — critique the diff in rounds. Inside
t3code the reviewer is a `delegate_task` (§2a). Anywhere else it is a fresh
headless Pi (§2b).

Make the most minimal possible changes to appease the reviewer. Be careful of
scope creep and don't be scared to push back.

## Budget

- Default: 3 rounds total. Round 1 is full. Later rounds review only changed
  code and open findings.
- Extend to 5 only for security, permissions, auth, data loss, or
  state/concurrency, while a blocker or should stays open with evidence. Or
  when the user asks.
- Stop early if a round returns only nits. Declined nits and comment, doc, or
  format-only fixes need no new round.
- One reviewer at a time. Never start two. The reviewer is stateless: every
  round is a fresh invocation carrying the full brief, the current diff, and
  the ledger.
- Keep a ledger of findings: id, severity, outcome. Never guess it.

## 1. Scope

Run `git status --short`. Do not stash, discard, or include unrelated
changes. Limit review to the change paths if they separate cleanly.
Otherwise stop and ask.

Find the base after `git fetch origin`:

- PR: `gh pr view <n> --json baseRefName,headRefOid`. Check out the branch
  only if clean. Confirm `HEAD` is the PR head, or ahead only by this change.
  Base: `git merge-base HEAD origin/<baseRefName>`.
- Local: `git merge-base HEAD origin/<default-branch>`. No remote: a base
  the user names, or `HEAD` for uncommitted changes only.

The change is base to working tree in those paths, with untracked files.
Use one diff command in all rounds. State intent and out-of-scope in 1-2
sentences. Run covering checks first. Do not send code this change breaks.
Note missing or pre-failing checks in the brief.

## 2. Run the reviewer

### 2a. In t3code: delegate_task

When running inside t3code, start the reviewer with `delegate_task` instead
of the headless Pi below.

- Call `orchestrator_capabilities` once before the first `delegate_task`
  (again only after an error or a user-named provider change). Pass the
  bifrost `smart` model in `target`, with low effort or the closest
  option offered.
- One `delegate_task` per round: `role: "review"`, `mode: "wait"` (the loop
  needs each verdict before continuing), pass `timeoutMs` of at least 15
  minutes (900000 — this model tends to overthink). Leave `isolation` shared
  so the reviewer reads this checkout. Never `t3_thread_send` to a finished
  child.
- The delegate is a full agent and receives only the `task` text. Carry the
  read-only constraints into the brief verbatim, include `git status
  --short` and check results, and have it run the diff command itself (see
  below) — do not paste the diff into the task.
- Read the verdict from `task_status` `summary`. A timeout, error, or empty
  summary is not approval. A timeout does not cancel the child: `task_cancel`
  it before re-running that round.

### 2b. Elsewhere: headless Pi

The reviewer is a headless Pi: read-only tools, no extensions, no skills. It
cannot edit the repo, only read it.

```bash
git diff <base> -- <paths> | pi --print --no-extensions \
  --model bifrost/smart --thinking low \
  --tools read,grep,find,ls \
  -- "<brief>"
```

The diff arrives via stdin, ahead of the brief. Build the brief from:

- Repo absolute path, base sha, intent, out-of-scope.
- `git status --short` output — untracked files are not in the diff; the
  reviewer reads them with the read tool.
- Check results.

Brief body (fill in, keep the constraints and reply format):

```
You are a read-only reviewer. Do not edit, commit, push, or comment on PRs.
Repo: <abs path> Base: <sha> Intent: <intent> Out of scope: <scope>
Checks: <results> Untracked: <git status --short>
A unified diff (base to working tree) precedes this brief. Read surrounding
code with your tools. Find bugs, broken callers, mismatch with intent.
Skip style unless it hides a bug. Hold to the smallest change. Flag code,
tests, or guards the intent does not need. Other paths, rare cases, small
perf, extra compat: nits.
blocker = intended case wrong. should = real bug callers will hit, in intent. nit = rest.
Reply:
VERDICT: APPROVE or CHANGES
S1 [blocker|should|nit] <file>:<line> <claim>. Fix: <suggestion>
Use stable ids (S1, S2, ...) across rounds.
```

In t3code (§2a), replace the brief's first sentence with: "Run `git diff
<base> -- <paths>` (base to working tree) first. Read surrounding code with
your tools." The diff does not precede the brief — the reviewer runs the
command itself.

Give the headless command a generous timeout (15 minutes or more); a long
review is normal. Do not edit scoped files while a reviewer runs — wait for
it. A timeout, error, or empty reply is not approval: re-run the round.

## 3. Answer findings

Check each finding and severity yourself. Another path, rare case, or small
cost is a nit, whatever label it arrived with.

- Agree: smallest fix. Prefer delete or narrow over a new lock, cache,
  helper, or option. Fix the case that happened. Add one focused test that
  fails without the fix, if intent needs it.
- Disagree: say why, with evidence (file:line, test, output).
- Out of scope or nit: decline in one line. List as follow-up.

Update the ledger. Re-run checks and `git diff --shortstat <base>`. If review
grew the diff, cut first. Do not agree just to end the loop.

## 4. Next round

Start one only if budget remains and a blocker or should is open, behavior
code changed, or approval does not cover the current behavior diff. Re-run
the round-1 reviewer (§2a in t3code, §2b otherwise) with the same base, and
extend the brief with the ledger
(`fixed:` / `disagree:` / `declined:` + evidence) and which ids are resolved
and which remain open.

## 5. Stop and ship

Agreed: APPROVE on the current behavior diff, no blocker or should open, no
concern of your own. Stuck: an item stays disputed after two replies, or
budget ends. Show both sides in 2-3 lines each. The user decides. Budget end
is not approval.

Do not push during the loop. Push after agreement only if the user asked to
push, ship, or update the PR. If you push to a PR, add above the model blurb:

`Reviewed with smart-loop: <N> rounds with bifrost/smart on low thinking.
Reviewer verdict: approved.`

Report: rounds, what you changed, diff size before/after, fixed and declined
findings with reasons, pushed or not.
