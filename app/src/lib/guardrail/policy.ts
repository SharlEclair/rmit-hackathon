/**
 * L2 POLICY OVERLAY and L3 SCOPE RESOLUTION (`05-AI-GUARDRAILS.md` sections 3.2, 3.3.2, 3.3.3).
 *
 * **The one direction that matters: a policy can only restrict.** `effectiveAllowed` is an
 * intersection and `effectiveProhibited` is a union, so a policy that permits something the
 * platform floor forbids changes nothing, and a policy that forbids something the floor allows
 * removes it. `policy-source.ts` rejects a view that tries to widen the floor; this file executes
 * the restriction on a per-turn decision.
 *
 * **Why the capability mapping exists here too.** A decision cites rule ids (`A5`), and the
 * overlay reasons in capabilities (`explain_terminology`). `CAPABILITY_BY_ALLOWED_RULE` is that
 * bridge, and it is the mechanism behind the `POL_RESTRICT` case in the golden set: an approved
 * policy that omits `explain_terminology` turns G21's answer into a refusal *without any rule
 * changing*, which is exactly what "the policy is data, not code" (D9) has to mean.
 *
 * **Fail closed.** An allowed outcome whose capability cannot be resolved is refused
 * (`POL_RESTRICT`) rather than passed: absence of a mapping is not permission (`N1`).
 *
 * **Pure.** No I/O, no clock, no randomness (`05` section 12.1).
 */

import type { PolicyOverlay } from './policy-source';
import { REASON_CODES } from './reasons';
import type { RuleOutcome } from './rules';
import type { ScopeToken } from './types';

/**
 * An `A`-rule id to the capability it exercises. `05` section 6.1's list is the authority for
 * which `A` rule means what; section 3.3.2's floor is the authority for the capability names.
 */
const CAPABILITY_BY_ALLOWED_RULE: Readonly<Record<string, string>> = {
  A1: 'explain_constraints',
  A2: 'interpret_rubric',
  A3: 'explain_ai_policy',
  A4: 'locate_source',
  A5: 'explain_terminology',
  A6: 'navigate_structure',
  A7: 'self_check_prompts',
  A8: 'quote_source_verbatim',
  A9: 'summarise_own_progress',
  A10: 'explain_constraints',
  A11: 'self_check_prompts',
  A12: 'explain_ai_policy',
};

/** The capability an allowed decision exercises, or `null` when no `A` rule is cited. */
export function capabilityForOutcome(outcome: RuleOutcome): string | null {
  for (const rule of outcome.rules) {
    const capability = CAPABILITY_BY_ALLOWED_RULE[rule];
    if (capability) return capability;
  }
  return null;
}

/**
 * The restriction refusal. It deliberately carries no capability name: `POL_RESTRICT` cites the
 * *policy* rule, and a capability name is internal vocabulary that `R11`/`N12` keep out of
 * anything a student reads.
 */
function refuseRestricted(): RuleOutcome {
  return {
    verdict: 'REFUSE',
    rules: ['POL_RESTRICT'],
    reasonCode: REASON_CODES.POLICY_RESTRICTS_REQUEST,
    scope: null,
    clarifyingQuestion: null,
  };
}

/**
 * L2. Apply the overlay to a decision L1 produced.
 *
 * Only `ALLOW` and `ALLOW_WITH_SCOPE` can be restricted here: every other verdict already refuses
 * or asks, and `C1`'s asymmetry means a restriction can never make a refusal *less* restrictive.
 */
export function applyPolicyOverlay(outcome: RuleOutcome, overlay: PolicyOverlay): RuleOutcome {
  if (outcome.verdict !== 'ALLOW' && outcome.verdict !== 'ALLOW_WITH_SCOPE') return outcome;

  const capability = capabilityForOutcome(outcome);
  if (capability === null) return refuseRestricted();

  if (overlay.effectiveProhibited.includes(capability)) return refuseRestricted();
  if (!overlay.effectiveAllowed.includes(capability)) return refuseRestricted();

  return outcome;
}

/**
 * L3. Scope resolution.
 *
 * The only deterministic scope source in the MVP is the upload sub-guard: an approved source
 * document attached by the student (`UP2`) is answerable by locate-and-quote, and nothing beyond
 * it (`05` section 6.4's `UP2` row). The other four scope tokens arrive with an L4 decision --
 * G22 is explicit about that, being a `MODEL` case whose expected scope is `SCOPE_TERM` -- so
 * inventing scopes here would both over-constrain answers and contradict the golden set.
 *
 * This function's real job is the invariant: `ALLOW_WITH_SCOPE` must carry exactly one scope, and
 * `ALLOW` must carry none. A violation is refused, not repaired.
 */
export function resolveScope(outcome: RuleOutcome): RuleOutcome {
  const scope: ScopeToken | null = outcome.scope ?? null;

  if (outcome.verdict === 'ALLOW_WITH_SCOPE' && scope === null) {
    return {
      verdict: 'REFUSE',
      rules: ['POL_INVALID'],
      reasonCode: REASON_CODES.POLICY_INVALID,
      scope: null,
    };
  }
  if (outcome.verdict === 'ALLOW' && scope !== null) {
    return {
      verdict: 'REFUSE',
      rules: ['POL_INVALID'],
      reasonCode: REASON_CODES.POLICY_INVALID,
      scope: null,
    };
  }
  return outcome;
}
