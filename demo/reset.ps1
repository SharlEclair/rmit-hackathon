# Restores the seeded demo state. Runs in well under 60 seconds.
#
# `11-BUILD-PLAN.md` WP-12 requires this for the run sheet's 11:30 row ("reset the demo state"), and
# `14-HACKATHON-SUBMISSION.md` section 3 calls it between rehearsals. It exists so that resetting is one
# command rather than a remembered psql incantation performed under time pressure.
#
# **What "reset" means here, and what it deliberately does not do.** The four acceptance runs build their
# own fixtures, and those fixtures are additive: they add assignments, milestones, discussion threads,
# queries and FAQ entries to the seeded course. They never modify the seeded demo assignment -- which is
# the property that makes re-seeding safe rather than destructive. So a reset re-applies the migrations,
# re-runs the deterministic seed, and reports what changed. It does not truncate tables: a `DROP` here
# would take the audit trail with it, and the audit trail is evidence.
#
# The seed is deterministic (`3a47eaf`), so re-running it converges on the same demo state rather than
# accumulating duplicates.
#
# Usage:  powershell -File demo/reset.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $root 'app'

Write-Host 'demo reset' -ForegroundColor Cyan

Write-Host '  1/4 migrations' -ForegroundColor DarkGray
Push-Location $app
try {
    & pnpm db:migrate
    if ($LASTEXITCODE -ne 0) { throw "pnpm db:migrate exited $LASTEXITCODE" }

    Write-Host '  2/4 schema drift' -ForegroundColor DarkGray
    Test-Path -LiteralPath (Join-Path $app 'scripts') | Out-Null
    & pnpm exec tsx --env-file-if-exists=.env scripts/verify-schema.ts
    if ($LASTEXITCODE -ne 0) { throw "schema drift check exited $LASTEXITCODE" }

    Write-Host '  3/4 seed' -ForegroundColor DarkGray
    & pnpm db:seed
    if ($LASTEXITCODE -ne 0) { throw "pnpm db:seed exited $LASTEXITCODE" }

    # **Step 4 is the one D81 assigns to this script and that it was missing.** The seed produces the
    # *published* cohort assignment on purpose (D81: beats 4-8 need gate rule G1 to admit it), and D81 is
    # explicit that the two pre-approval demo states are WP-12's job rather than the seed's. Without this
    # step beats 2 and 3 have almost nothing to show: the seeded assignment carries 54 PUBLISHED artifacts
    # against 1 NEEDS_REVIEW, so the `AI generated - requires tutor approval` badge renders for almost
    # nothing and the "discard a candidate" action has no candidates.
    Write-Host '  4/4 demo states' -ForegroundColor DarkGray
    & pnpm demo:state
    if ($LASTEXITCODE -ne 0) { throw "pnpm demo:state exited $LASTEXITCODE" }
}
finally {
    Pop-Location
}

Write-Host ''
Write-Host 'demo state reset, including the two pre-approval states.' -ForegroundColor Green
Write-Host 'Start the server with "cd app; pnpm dev", then run "pnpm demo:smoke".' -ForegroundColor Green
