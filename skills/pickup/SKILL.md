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

Then judge the task. If it is simple and the next steps are clear, begin work
immediately. Otherwise refine it with the user first: restate the goal in your
own words, propose an approach, and settle open questions about scope and
acceptance criteria before writing code. Follow the repository's own
conventions while implementing, and finish with `file-pr` and `babysit-pr`
when the work ends in a pull request.
