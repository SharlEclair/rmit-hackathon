# 07 -- Archive

**Purpose.** Snapshots of [`../06-SESSION-LOG.md`](../06-SESSION-LOG.md) as it stood at each phase
end. The live log is append-only and grows without bound; these copies are what the log looked like
at a known-good boundary, so a reader can see the state at a phase without reading every session.

**Convention.** At phase exit (step 6 of the exit protocol in
[`../00-README.md`](../00-README.md)) copy the session log into `phase-NN/06-SESSION-LOG.md`:

```powershell
New-Item -ItemType Directory -Force docs/handoff/07-ARCHIVE/phase-NN
Copy-Item docs/handoff/06-SESSION-LOG.md docs/handoff/07-ARCHIVE/phase-NN/06-SESSION-LOG.md
```

**Rule.** Never edit an archived copy. It is evidence of what was true at that tag; if it turns out
to have been wrong, correct the live log and say so there.

| Snapshot | Tag | What it covers |
|---|---|---|
| [phase-00/06-SESSION-LOG.md](phase-00/06-SESSION-LOG.md) | `phase-00-complete` | Session 00: reconciliation, provider de-risking, handoff scaffold |
