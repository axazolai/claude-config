# `/publish step` — dev-push subagent brief

Filled and dispatched by `/publish step`, step 4. Replace every `<...>` placeholder from
`.claude/publish.json` and the run; `<TEST_COMMANDS>` is `tests.commands` as a numbered list,
`<EXPECTED_COUNTS>` the counts from the last green run if known, else "unknown". Write the brief
in the user's language.

---

> Publish the local `<dev>` branch of the project at `<PROJECT_DIR>` to `<remote>`.
>
> Branch `<dev>`, clean tree, local commits ready to push. The production release point is
> already frozen on branch `<snapshot>`, so your push to `<dev>` does not reach the release.
>
> CONSTRAINTS: the working tree is shared with the main session — no `checkout`, `switch`,
> `merge`, `rebase`, `stash`, commits or file edits. Your only push is `git push <remote> <dev>`.
> No `--force`, no `--no-verify`.
>
> Run every check SYNCHRONOUSLY in the foreground with a 600000–900000 ms timeout. Never run a
> check in the background and wait for a notification — that hangs forever.
>
> 1. Run the test commands in this order, each on its own, never chained into one call:
>    <TEST_COMMANDS>
>    A failure the project documents as a known flake may be rerun once, standalone.
>    Expected counts: <EXPECTED_COUNTS>.
> 2. Any failure left → STOP here; do not push.
> 3. `git push <remote> <dev>` (under `--dry-run`: print it, do not run it).
> 4. <WATCH_INSTRUCTION — CI present and watched: "Watch the `<dev>` pipeline yourself,
>    synchronously: find the newest pipeline for ref `<dev>` (`<LIST_COMMAND>`), then check it
>    (`<GET_COMMAND>`) every 30–60 seconds until its status is final. No notification arrives —
>    you poll. Do not end your turn before a final status." Otherwise: "No pipeline to watch.">
>
> FAILURE REPORT — details, not the fact of failure. Failed tests: suite and full test name,
> the assertion message with expected and actual values, file and line. Red pipeline: pipeline
> id, job id and name, and 20–40 lines of the job log around the first error. Fix nothing
> yourself — these details are needed to fix it right after the release.
>
> On success: counts for each test command, the pushed commit range, pipeline id and job
> statuses.
