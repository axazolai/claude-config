---
name: publish
description: One release skill with four launch keys — /publish dev (merge the work branch into the dev branch, version bump and changelog, tests, push, watch the pipeline), /publish prod (confirm the version, MR/PR dev to prod, green pipeline, merge, tag, watch the tag pipeline), /publish fast (the no-gate path - push, MR/PR, the agent merges, tag), /publish step (freeze a release branch, MR/PR it to prod, and push new work into dev in parallel through a subagent). GitLab (glab), GitHub (gh), or plain git without CI/CD. Project facts come from .claude/publish.json, written by a first-run interview. Use when the user says "publish", "release to prod", "push to dev", or runs /publish.
argument-hint: "dev | prod [X.Y.Z] | fast | step [X.Y.Z] [--dry-run] [--reconfigure] [--agent-merge] [--no-watch]"
---

# /publish — release through launch keys

Instruction for an AI operator. Follow the chosen mode in order. **STOP** means: stop, report
to the user, wait for their decision. Do not improvise around a STOP.

| Invocation | Does |
|---|---|
| `/publish dev` | merge the work branch into the dev branch, version bump + changelog, tests, push the work branch, delete it locally, push dev, watch the pipeline |
| `/publish prod [X.Y.Z]` | confirm the version, verify dev, MR/PR dev → prod, wait for a green MR/PR pipeline, merge (the user, unless `--agent-merge`), verify, tag, watch the tag pipeline |
| `/publish fast` | dev merge + push with no tests and no pipeline wait, MR/PR, the agent merges, tag, tag pipeline reported but not gating |
| `/publish step [X.Y.Z]` | freeze the release point as `<releasePrefix>X.Y.Z`, MR/PR it to prod, push new work into dev in parallel through a subagent |

Common keys: `--dry-run` (every step printed, nothing pushed, merged or tagged — see Dry run),
`--reconfigure` (re-run the interview), `--agent-merge` (prod/step: the agent merges instead of
the user), `--no-watch` (skip pipeline watching; the report says it was not watched).

No mode given → ask which one, showing the table above. Invoking a mode is the user's push
permission for that run, only for what they confirm inside the flow.

Placeholders below: `<remote>`, `<dev>`, `<prod>` = `remote`, `branches.dev`, `branches.prod`;
`<tag>` = `version.tagPrefix` + `X.Y.Z`; `<snapshot>` = `branches.releasePrefix` + `X.Y.Z`.

## Settings

Every run starts by reading `.claude/publish.json` at the project root. Missing, or
`--reconfigure` → run the interview, write the file, show it, then continue with the mode.

```json
{
  "host": "gitlab | github | none",
  "remote": "origin",
  "branches": { "dev": "dev", "prod": "main", "releasePrefix": "release/v", "deleteWorkBranch": true },
  "cli": "glab | gh | null",
  "ci": { "present": true, "watch": true },
  "version": { "files": [{ "path": "package.json", "key": "version" }], "tagPrefix": "v" },
  "changelog": { "path": "CHANGELOG.md", "format": "markdown | json", "notesDir": null },
  "tests": { "commands": ["npm test"] },
  "merge": { "prod": "user", "fast": "agent" }
}
```

Field meanings:

- `version.files` — every file carrying the version, bumped together; `key` is a dotted path
  (`version`, `project.version`, `package.version`) or, for XML, the element name (`Version`).
  The FIRST file is the reference: its version on a branch is "the version on that branch".
- `changelog` — one object, or an array of them when the project keeps several; the first is
  the release changelog whose top entry must match the version. `null` → no changelog step.
  `notesDir` — a directory for one release-notes file per version (`<notesDir>/X.Y.Z.md`), or
  `null`.
- `tests.commands` — run in this order, each on its own, in the foreground. Empty → no tests.
- `merge.prod` — who merges into prod in `prod` and `step` (`user` | `agent`); `--agent-merge`
  overrides it to `agent` for one run. `merge.fast` — same for `fast`.
- `ci.watch: false` — same as `--no-watch` on every run.

### Interview

Detect first; ask only what detection cannot settle; one question at a time; show the detected
value as the default.

1. `host` / `remote` — `git remote -v`. A GitLab or GitHub URL sets `host`; several remotes →
   ask which one publishes; no recognised host → `host: "none"`.
2. `cli` and access — `glab auth status` (GitLab) or `gh auth status` (GitHub). Access is
   needed to open the MR/PR, watch pipelines, merge and tag. Missing CLI or no access → name the
   steps that become manual (printed commands or a web URL for the user) and ask whether to
   continue that way. No → STOP.
3. `ci.present` — `.gitlab-ci.yml` or `.github/workflows/*`. None → `false` (see No CI/CD path).
4. Branches — list `git branch -r` for `<remote>`; offer the likely dev and prod names; the user
   confirms both. Ask `releasePrefix` only when the user will use `step`; default `release/v`.
   Ask whether the work branch is deleted locally after its push (`deleteWorkBranch`).
5. Version files — detect from `package.json`, `pyproject.toml`, `Cargo.toml`, `*.csproj`
   (and nested ones in a multi-package repo); the user confirms the list and its order. Tag
   prefix from `git tag --sort=-creatordate | head -5`; default `v`.
6. Changelog — detect `CHANGELOG.md`, `changelog.json` (and nested ones); confirm; ask whether
   the project keeps per-version release notes and where.
7. Tests — the "Detected commands" block of `.claude/stack-rules.md`, else `package.json`
   scripts / the stack's usual runner; the user confirms the commands and their order.
8. Merge — who merges into prod by default (`user` recommended).

`.claude/publish.json` stays local unless the project chooses to track it.

## Hard rules

1. **The version is the user's choice or confirmation, never computed silently.** A proposed
   bump (feat → minor, fix → patch) is shown and confirmed before it is written.
2. **Nothing unreleased is pushed to `<dev>` as part of a prod release.** `prod` and `fast`'s
   release half release only what is already on `<remote>/<dev>`; a pipeline fix is separate
   work with its own permission (`/publish dev`).
3. **A failed gate stops the run and reports** — failing test, red gating pipeline, refused
   push, failed verification. Never push past it.
4. **`<prod>` is never force-pushed; no `--force` anywhere in this skill.** No hook is bypassed
   (`--no-verify`); a blocked commit or merge is handed to the user.
5. **A tag is never reused or moved.** `git tag -l <tag>` must be empty before tagging. Taken →
   bump the patch component with its own changelog entry (an internal-only release still gets an
   entry that says plainly what it did not change).
6. **The tag comes after the merge, on the current `<remote>/<prod>` tip.** Production deploys
   only from such a tag; never reference a floating `latest`.
7. **Stage deliberately.** Never `git add -A` / `git add .`: the tree may hold the user's
   unrelated edits. Stage only files of the work being published.
8. **Merging into `<prod>` is the user's**, unless `merge.*` / `--agent-merge` says `agent` for
   this mode. A permission or classifier denial is never worked around: hand the exact command
   to the user.

## Mode: dev

The order is fixed: merge into local `<dev>` → bump and changelog → tests → push the work
branch → delete its local copy → push `<dev>`. The work branch is pushed before it is deleted,
so it survives on the remote as that work's history.

### 1. Detect the state

```bash
git fetch <remote> <dev>
git branch --show-current            # remember it: the work branch
git status --porcelain
git rev-list --count <remote>/<dev>..<dev>
```

### 2. Merge the work branch into local `<dev>`

Already on `<dev>` → skip. Otherwise:

```bash
git switch <dev>
git merge --ff-only <branch>
```

*Dry run: printed, skipped.* Fast-forward impossible → report why (`<dev>` moved) and ask for
the strategy (merge commit or rebase); do not create a merge commit on your own.

### 3. Uncommitted changes

Non-empty status → show the list and ask whether to commit. Stage only the published work
(hard rule 7); declined → leave them, they are not published. *Dry run: printed, skipped.*

### 4. Version bump, changelog, release notes

After the merge, before any push. Last released version: `git tag --sort=-creatordate | head -1`.

- Propose one bump from the commit types since that tag; the user confirms (hard rule 1).
  Write it to every `version.files` entry.
- Changelog entries follow the file's own language, wording and prefixes; describe what a
  user of the product notices. An entry about an API change names every endpoint whose
  request or response shape changed.
- `notesDir` set → write `<notesDir>/X.Y.Z.md` in the shape of its neighbours: behaviour and
  API only, anything someone who knew the old behaviour will notice, and any rollback step the
  release needs (e.g. a migration that must be reverted before the old build returns).
- Commit as one `chore(release): X.Y.Z`. *Dry run: printed, skipped.*

Nothing to publish (`<remote>/<dev>..<dev>` empty) → report and STOP. Otherwise list
`git log --oneline <remote>/<dev>..<dev>` and confirm this is what gets published. No → STOP.

### 5. Tests

Run `tests.commands` in order, each standalone, synchronously in the foreground (timeouts
600000–900000 ms); never background a gate and wait for a notification. If a test tier runs
against a server started before the bump, restart it first so it serves the new version. A
failure the project documents as a known flake may be rerun once, standalone. Any other
failure → STOP: report the failing tests, push nothing.

### 6. Push the work branch

Skip if the work was committed directly on `<dev>`.

```bash
git push -u <remote> <branch>
```

*Dry run: printed, skipped.*

### 7. Delete the local work branch

Only when `branches.deleteWorkBranch` is true and step 6 pushed it.

```bash
git branch -d <branch>
```

*Dry run: printed, skipped.* `-d`, never `-D`: a refusal means the merge did not land → STOP.

### 8. Push `<dev>`

```bash
git push <remote> <dev>
```

*Dry run: printed, skipped.*

### 9. Watch the pipeline

Unless `--no-watch` or no CI: watch the `<dev>` pipeline to its final status (Host specifics).
Red → diagnose from the failed job's log (Pipeline failures) and propose a fix; the fix is new
work that goes through steps 3–8 after approval. Never leave a red pipeline unreported.

## Mode: prod

### 1. Confirm the version

```bash
git fetch <remote> <dev> <prod> --tags
git show <remote>/<dev>:<version.files[0].path>     # read the version at its key
git show <remote>/<dev>:<changelog.path> | head -20  # top entry
```

- The user named `X.Y.Z` → it must equal the version on `<remote>/<dev>` (reference file and
  top changelog entry). Mismatch → STOP, reporting the version actually there.
- No version named → ask "`<remote>/<dev>` is at X.Y.Z — publish it?" Anything but yes → STOP.
- `git tag -l <tag>` non-empty → hard rule 5: the patch bump lands on `<dev>` through
  `/publish dev` with the user's permission, then restart this mode.

### 2. Record the release point

```bash
git rev-parse <remote>/<dev>            # DEV_TIP
git log --oneline <remote>/<prod>..<remote>/<dev>
```

Nothing between them → report and STOP.

### 3. Open the MR/PR `<dev>` → `<prod>`

Title `Release X.Y.Z: <one-line summary>`; description: one line per version since the previous
tag, from the changelog; assignee and reviewer the user (Host specifics).
*Dry run: printed, skipped.* No host → skip to step 5 (No CI/CD path).

### 4. Wait for a green MR/PR pipeline

The release is gated here. Red → Pipeline failures; a fix lands on `<dev>` as separate,
separately permitted work, and the MR/PR picks it up. Never merge on red. `--no-watch` → ask
the user to confirm the pipeline is green before step 5.

### 5. Merge

- `merge.prod: "user"` (default) → hand the user the MR/PR URL and the exact merge command;
  wait for their confirmation. Do not proceed on assumption.
- `agent` (setting or `--agent-merge`) → run the merge command. *Dry run: printed, skipped.*

### 6. Verify the merge

```bash
git fetch <remote> <prod>
git merge-base --is-ancestor <DEV_TIP> <remote>/<prod> && echo OK
```

No `OK` → STOP: `<prod>` does not contain `DEV_TIP`.

### 7. Tag

Re-read the version on `<remote>/<prod>` (reference file and top changelog entry); it must equal
the confirmed one. Mismatch → STOP.

```bash
git tag -a <tag> <remote>/<prod> -m "Release X.Y.Z: <one-line summary>"
git push <remote> <tag>
```

*Dry run: printed, skipped.*

### 8. Watch the tag pipeline

Watch it to its final status. All jobs green = production deployed. Red → Pipeline failures;
a failed tag pipeline means production did NOT deploy.

## Mode: fast

The no-gate path, on the user's explicit request. Relative to `dev` + `prod` it skips: the
local test run, waiting on the `<dev>` pipeline, waiting on the MR/PR pipeline, and the user's
merge (`merge.fast`, default `agent` — invoking `/publish fast` is that authorization, for this
mode only). The tag pipeline still runs and is reported, but gates nothing that already
happened. Hard rules 1, 4, 5, 6, 7 still apply. If a gate matters for this release, use
`/publish dev` + `/publish prod`.

### 1. Merge the current branch into local `<dev>`

Uncommitted changes → stage the release's files and commit (ask only if ownership is unclear).
Then as dev step 2 (`--ff-only`; divergence → ask). *Dry run: printed, skipped.*

### 2. Push `<dev>` — no tests, no pipeline wait

```bash
git push <remote> <dev>
```

*Dry run: printed, skipped.* Do not run `tests.commands`; do not poll the pipeline.

### 3. Confirm the version

As prod step 1. Anything but yes → STOP.

### 4. Open the MR/PR `<dev>` → `<prod>`

Record `DEV_TIP` (`git rev-parse <remote>/<dev>`), then open it as prod step 3.
*Dry run: printed, skipped.* Do not wait for its pipeline.

### 5. Merge

`merge.fast: "agent"` → run the merge command without asking again; `"user"` → as prod step 5.
*Dry run: printed, skipped.*

### 6. Verify the merge

As prod step 6. No `OK` → STOP; never tag blind.

### 7. Tag

As prod step 7. *Dry run: printed, skipped.*

### 8. Watch the tag pipeline — reporting only

Watch it to the end: this is the first place real verification runs. A known runner-environment
failure may be retried once; any other red job → diagnose and report, no blind retries.

## Mode: step

Releases what is on `<remote>/<dev>` while new local commits go to `<dev>`, without either
contaminating the other. An MR/PR tracks a branch, not a commit: while one is open from `<dev>`,
every push to `<dev>` joins it. So the release point is frozen as `<snapshot>` before any push
to `<dev>`, and the MR/PR is opened from the snapshot. The dev push runs in a subagent.

Extra rules for this mode:

- Nothing is pushed to `<dev>` until the snapshot is pushed and verified (step 3).
- The MR/PR source is `<snapshot>`, never `<dev>`. `<snapshot>` is never deleted.
- One working tree, two streams: while the subagent runs, the main session issues read-only
  git and CLI commands only — no `checkout`, `switch`, `merge`, `rebase`, `stash`, commits or
  file edits. The subagent is bound by the same list; its only push is `git push <remote> <dev>`.
- A red dev pipeline never blocks the release; fix `<dev>` afterwards as separate work.

Prerequisites: `git status --porcelain` empty (commit first), `git tag -l <tag>` empty,
`git branch -a --list "*<snapshot>"` empty.

### 1. Confirm the version

As prod step 1, against the CURRENT `<remote>/<dev>` tip, not the local one.

**Version collision** — the tag exists, or local `<dev>` carries the same version as the
release point: two builds must never share a number. Bump the patch on BOTH streams, lower
number to the stream released first (release point at 1.4.0 with tag taken → snapshot 1.4.1,
`<dev>` 1.4.2). The snapshot's bump is committed on the snapshot branch, never on `<dev>`. Each
bump has its own changelog entry; `<dev>` also gets the snapshot's entry below its own, so the
chain has no gap. The next `<dev>` → `<prod>` merge will conflict on the version files and
changelog: keep `<dev>`'s number and the union of entries, newest first. The user declines →
release another point, or cancel and use `/publish dev`.

### 2. Record the release point

```bash
git rev-parse <remote>/<dev>                       # RELEASE_SHA, quoted in every report
git log --oneline <remote>/<prod>..<remote>/<dev>
```

### 3. Freeze it — the gate for everything below

```bash
git branch <snapshot> <RELEASE_SHA>
git push <remote> <snapshot>
git rev-parse <remote>/<snapshot>                  # must equal RELEASE_SHA
```

*Dry run: printed, skipped.* Refused push, existing branch, or SHA mismatch → STOP; the streams
are not independent yet.

### 4. Launch the dev push in a subagent

Dispatch one subagent with `step-subagent-brief.md` (beside this file), placeholders filled.
Do not wait — continue to step 5; that parallelism is the point. If it stops early "waiting for
a background job", resume it and require synchronous foreground runs.
*Dry run: the filled brief is printed, no subagent is dispatched.*

### 5. Open the MR/PR `<snapshot>` → `<prod>`

As prod step 3 with source `<snapshot>`. *Dry run: printed, skipped.*

### 6. Wait for a green MR/PR pipeline

As prod step 4. A fix for the release lands on `<snapshot>` with its own explicit permission; a
fix for `<dev>` waits until the release is done.

### 7. Merge

As prod step 5. *Dry run: printed, skipped.*

### 8. Verify the merge

```bash
git fetch <remote> <prod>
git merge-base --is-ancestor <RELEASE_SHA> <remote>/<prod> && echo OK
```

No `OK` → STOP.

### 9. Tag

As prod step 7. *Dry run: printed, skipped.*

### 10. Watch the tag pipeline, then report both streams

As prod step 8. Report Production and Dev as two separate outcomes (Report format). The
subagent returns diagnosis material, not a verdict: a report that says only "tests failed" or
"pipeline red" is incomplete — send it back for the details its brief requires. Dev failed →
propose the fix as its own `/publish dev` cycle; the release stands regardless.

## Host specifics

**GitLab (`glab`).**

| Action | Command |
|---|---|
| Open MR | `glab mr create --source-branch <src> --target-branch <prod> --title "..." --description "..." --assignee "@me" --reviewer "@me"` |
| Pipeline of a ref | `glab ci status --branch <ref> --wait` (or `glab ci list --per-page 5`, then `glab ci get -p <id>`) |
| MR pipeline | `glab ci get --merge-request <iid>` |
| For the user, interactive | `glab ci view <ref>` / `glab ci view -p <id> --web` |
| Failed job log | `glab api projects/:id/jobs/<job_id>/trace \| tail -80` |
| Retry a job | `glab api --method POST projects/:id/jobs/<job_id>/retry` |
| Merge | `glab mr merge <iid> --yes` |

**GitHub (`gh`).**

| Action | Command |
|---|---|
| Open PR | `gh pr create --base <prod> --head <src> --title "..." --body "..." --assignee @me` |
| PR checks | `gh pr checks <n> --watch` |
| Runs of a ref | `gh run list --branch <ref> --limit 5`, then `gh run watch <run-id> --exit-status` |
| Failed job log | `gh run view <run-id> --log-failed` |
| Retry | `gh run rerun <run-id> --failed` |
| Merge | `gh pr merge <n> --merge` |

Polling: no notification arrives when a pipeline ends — poll every 30–60 s in the foreground
until a final status. No CLI access → print these commands (or the web URL) for the user and
wait for them to report the result.

### Pipeline failures

- **Runner environment, not code** — out of disk space (often surfacing as a registry push
  error), a scanner timing out while downloading its rules, a runner lost. Retry the job ONCE
  before suspecting a regression; never push a "fix" to `<dev>` for it. Recurs → the runner host
  needs attention outside the repository. Note what already landed (a partially pushed image
  set) before reporting.
- **Tag pipeline rejects the tag as not on `<prod>`** — it was created before the merge or off a
  stale ref. Nothing deployed. With the user's confirmation: `git push <remote> :refs/tags/<tag>`,
  `git tag -d <tag>`, finish the merge, tag the current `<remote>/<prod>` tip.
  *Dry run: printed, skipped.*
- **Anything else** — read the first error in the job log, match it against the project's own
  troubleshooting notes, propose a fix; it goes through `/publish dev`.
- **Pipeline green, production not updated** — the deploy did not pick up the tag; check the
  deploy job and whether the deployment references the tag rather than a floating image.

## No CI/CD path

`ci.present: false` → every pipeline step is skipped and says so in the report; the local
`tests.commands` run is then the only gate, so `fast` warns before skipping it.
`host: "none"` → no MR/PR; publishing is merge, push and tag in git:

```bash
git switch <prod>
git merge --ff-only <remote>/<dev>      # prod; in step: <remote>/<snapshot>
git push <remote> <prod>
git switch <dev>
```

*Dry run: printed, skipped.* This merge follows `merge.*` like the MR/PR merge: `user` → hand
the commands over and wait. Fast-forward impossible → report the divergence and ask; never
force. No remote at all → merge and tag locally, nothing is pushed, and the report says so.

## Dry run

`--dry-run` runs every read-only step for real (fetch, status, log, show, version reads, tag and
branch existence checks, the interview) and prints every writing step — merge, commit, push,
tag, branch create or delete, MR/PR create, merge, job retry, subagent dispatch — as the exact
command it would run, marked `[dry-run: skipped]`. Nothing is pushed, merged or tagged; no file
is written except `.claude/publish.json` when the interview ran. A STOP condition still stops.

## Report format

Plain, in this order; never claim success on git actions alone.

- **Mode** and flags (`--dry-run` → "dry run: nothing was changed").
- **Version** X.Y.Z and how it was confirmed.
- **What moved** — commit range pushed, branches pushed or deleted, MR/PR number and URL, who
  merged, tag.
- **Tests** — commands run and their counts, or "skipped (fast)".
- **Pipelines** — id and final job statuses, or "not watched" / "no CI/CD".
- **Outcome** — "dev published" / "production deployed" only on a green final pipeline (or, with
  no CI/CD, a completed push). Anything else: say plainly that it did not deploy.
- **step** — two separate outcomes, never one verdict: Production (version, `RELEASE_SHA`,
  MR/PR, tag, tag pipeline) and Dev (the subagent's result in substance: pushed range, pipeline
  and status, or the failure details and the next action).
- **Next action** on any STOP or failure.
