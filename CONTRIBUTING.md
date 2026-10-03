# CONTRIBUTING.md -- Team Working Agreement

> Human-facing companion to `AGENTS.md`. Agents must follow `AGENTS.md`; humans should follow both.

---

## 1. Repository etiquette for this hackathon

The hackathon explicitly rewards visible, honest progress (`hackathon info/info.md`): *"Commit often to your GitHub repository to show proof of your progress and development."* That is a scored behaviour, not a formality.

### Rules

1. **Commit small and often.** One logical change per commit. Aim for many commits over the weekend, not one large commit at 11:45 AM on Sunday.
2. **Never commit secrets.** `cookies.txt`, `.env`, API keys, tokens, and exported Canvas sessions must stay out of the repository. `.gitignore` already covers them -- verify before every `git add -A`.
3. **Never commit work that is not ours.** No vendored third-party code without a licence check, no datasets we do not have the right to publish, no old project or coursework material.
4. **Never rewrite shared history.** No `push --force` to a branch someone else is working on, no `rebase` of already-pushed commits. If the history is wrong, add a commit that fixes it.
5. **Frozen files stay frozen.** `docs/project idea.md`, `docs/assignment_assistant_project_handoff.md`, and `hackathon info/info.md` are source-of-truth inputs. Do not edit, move, or reformat them. If something in them is now wrong, record the change in `docs/01-DECISIONS.md` instead.

---

## 2. Commit messages

Conventional-commit style, imperative mood, scoped:

```
<type>(<scope>): <what changed and why in one line>

<optional body: context, tradeoff, what is NOT done>
```

| Type | Use for |
|---|---|
| `feat` | new user-visible capability |
| `fix` | bug fix |
| `docs` | documentation only |
| `refactor` | behaviour-preserving change |
| `test` | tests only |
| `chore` | tooling, config, dependencies |
| `spike` | throwaway exploration (say so in the body; delete before submission if it is not used) |

Scopes in use: `docs`, `app`, `guardrail`, `assistant`, `ingest`, `analytics`, `discussion`, `auth`, `archive`.

Examples:

```
feat(guardrail): refuse-by-default policy gate with golden-set harness
docs(scope): commit the MVP cut and move deadline tracking out of scope
fix(assistant): stop echoing student code back in refusal messages
```

Because AI assistance must be disclosed, make it easy to reconstruct the story: if a commit's content was substantially AI-drafted, that is fine -- but the commit message must describe the change accurately, and the disclosure in `docs/14-HACKATHON-SUBMISSION.md` must stay truthful.

---

## 3. Branching

Small team, short timeline. Keep it simple:

- `main` -- always runnable. Never push a broken build to `main`.
- `feat/<short-name>` or `fix/<short-name>` -- one branch per meaningful unit of work.

Open a PR into `main` when a unit is complete and verified. Keep PRs small enough that another team member can review them in a few minutes. A PR description should state: what changed, how it was verified, what is mocked, and which doc it implements.

---

## 4. Definition of done

A piece of work is done when **all** of the following hold:

- [ ] It runs, and someone other than the author has seen it run.
- [ ] Typecheck, lint, and tests pass.
- [ ] It does not weaken any constraint in `AGENTS.md` S2.
- [ ] If AI behaviour changed, the guardrail golden set was updated and passes.
- [ ] Docs changed in the same PR if interfaces or behaviour changed.
- [ ] Any mock or shortcut is labelled in code **and** listed in `docs/11-BUILD-PLAN.md` under *what is mocked*.
- [ ] It is committed with an honest message.

---

## 5. The rules we will not trade away under time pressure

Hackathon crunch makes it tempting to relax exactly the things that make this product interesting. Do not.

| Temptation | Why we refuse |
|---|---|
| "Just let the Assistant answer this one implementation question so the demo looks smoother." | The refusal **is** the demo. It is differentiator #2 in `docs/13-DEMO-STORY.md`. |
| "Skip tutor approval for demo speed, it's obviously fine." | Tutor approval is the trust boundary (`AGENTS.md` C3). Without it the product is an unmoderated AI writing course policy. |
| "Show per-student analytics, it's a better chart." | Aggregate-only is the privacy promise (C5). A prettier chart is not worth breaking it. |
| "We'll add the guardrail tests after the demo." | The guardrail is the riskiest code in the repo and the easiest to get subtly wrong. Untested guardrail = no guardrail. |
| "Commit everything at the end in one go." | Loses the progress evidence the hackathon scores, and makes the AI-use disclosure impossible to write honestly. |

---

## 6. Getting unstuck

1. Re-read the relevant doc in `docs/` -- most blockers in this project are a requirement that was already decided.
2. If the doc is silent, add an entry to `docs/01-DECISIONS.md` with the conservative choice, then proceed.
3. If two docs disagree, the earlier-numbered doc wins, and the later one is buggy -- fix it in the same commit.
4. If you are blocked on something outside the team's control (an API key, a rate limit, a Canvas session), say so immediately and pick up unblocked work. Do not idle.
