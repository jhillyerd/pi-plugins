---
name: pickup
description: Pick up an open, unassigned GitHub issue to work on. Use when the user asks to pick up, grab, or take an issue, or wants to pick work from the issue backlog.
---

# Pickup

Check that `gh` is authenticated with `gh auth status` before starting.

Fetch the ten most recent open, unassigned issues in the current repository:

`gh issue list --state open --limit 10 --search "no:assignee sort:created-desc" --json number,title,labels,updatedAt`

Display them as a Markdown table with the issue number, title, labels, and
last update. If none are open and unassigned, say so and offer the ten most
recent open issues instead.

Ask the user for the number of the issue they want, then end the turn. When
they reply with one, read the full issue and its comments with
`gh issue view <number>`, then assign it to the active gh user:

`gh issue edit <number> --add-assignee "@me"`

## Align the thread and the branch

Before writing code, name the branch and this thread after the issue, so later
commits, the PR, and the thread all read the same way.

Build a slug from the issue title: lowercase, letters and digits only, joined
with hyphens, trimmed to about 40 characters. Use `<type>/<number>-<slug>`,
where `<type>` is `fix` for a bug, `feat` for new capability, or `chore`
otherwise — for example `fix/123-login-token-crash`.

- On the repository's default branch, or on a branch that already has a PR,
  branch instead of rename: `git switch -c <name>`. Never rename `main` or a
  branch a pull request points at.
- Otherwise rename in place: `git branch -m <name>`. Do it before the first
  push; renaming an already-pushed branch needs a force-push and breaks the
  PR link. A name already checked out in another worktree is taken — add a
  suffix rather than forcing it.

Then, when running inside t3code, rename the thread itself with
`t3_thread_update` (`action: "rename"`, `title: "#<number> <issue title>"`,
no `threadId` so it targets this thread). The branch is not renamed there —
the `git` step above is what moves it. Outside t3code there is no thread to
rename, and `git` is all there is.

Skip this when the user named a branch, or when the work continues an existing
branch or PR. Report both new names.

Then judge the task. If it is simple and the next steps are clear, begin work
immediately. Otherwise refine it with the user first: restate the goal in your
own words, propose an approach, and settle open questions about scope and
acceptance criteria before writing code. Follow the repository's own
conventions while implementing, and finish with `file-pr` and `babysit-pr`
when the work ends in a pull request.
