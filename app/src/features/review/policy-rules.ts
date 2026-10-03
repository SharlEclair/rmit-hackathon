/**
 * The AI Usage Policy write guard (`06` section 7.2.11; trap **T22**; D83).
 *
 * **The failure this prevents.** `06` section 7.2.11 gives `rule_code` only a shape
 * (`^[a-z][a-z0-9_]{2,63}$`) while the guardrail computes with `05` section 3.3.2's **closed**
 * capability vocabulary, so `src/lib/guardrail/policy-source.ts` maps one to the other with its
 * private `CAPABILITIES_BY_RULE_CODE` table. `05` section 3.3.1 makes an unmapped
 * *assistant-applicable* code a `POL_INVALID` failure -- which refuses **every** request for that
 * assignment, including the permitted ones. That is the right direction to fail (never guess), but
 * it means a tutor typing a plausible new rule code into the policy editor would silently disable the
 * Assistant for the whole assignment. Trap T22 records exactly that; D83 adds the mapping-table rule.
 *
 * **Why the refusal belongs at write time.** The alternative is to accept the row and let the
 * read-time policy validation refuse everything. That is defensible only if the tutor can see why,
 * and the review bundle cannot show a per-rule reason for a whole-assignment failure. Refusing the
 * write with the offending code named puts the diagnosis where the author is, and it keeps a
 * persisted row from being the reason a demo's refusal beat cannot happen.
 *
 * **Scope of the check, and the defect this paragraph exists to prevent.** The guardrail requires a
 * capability mapping only for an `ALLOW` or `PROHIBIT` rule: `policyFromRows` enforces those two
 * effects through the capability algebra and enforces `ESCALATE_TO_TUTOR`/`CLARIFY` through a named
 * subject (`capabilitiesForPolicyRuleCode` is not consulted at all for them, and an unknown escalation
 * subject defaults rather than failing). A guard that asked for a mapping for **every**
 * assistant-applicable code therefore invented refusals the guardrail does not make -- and it did:
 * Phase 4's own acceptance run refused `route_uncertain_requests_to_tutor`, the seeded demo policy's
 * escalation rule, which the guardrail has always accepted (`I-42`, trap **T31**). The rule this
 * module now follows is that a write-time guard must mirror the read-time validator exactly, because
 * a guard stricter than the validator is not "fail closed" -- it is a second, wrong definition of the
 * policy's validity, and it would have stopped a demo from publishing a legitimate escalation rule.
 */

import { capabilitiesForPolicyRuleCode } from '@/lib/guardrail/policy-source';

/** `ai_policy_rules.rule_code`'s shape CHECK (`06` section 7.2.11), checked before the insert. */
const RULE_CODE_PATTERN = /^[a-z][a-z0-9_]{2,63}$/;

export interface PolicyRuleCodeCheck {
  readonly ok: boolean;
  /** A sentence naming the offending code, safe to show a tutor and to return in `details`. */
  readonly message?: string;
  /** The capability names the mapping produces, when the code is known. */
  readonly capabilities?: readonly string[];
}

/** True when the guardrail's policy computation will consider this rule (`05` section 3.3.1). */
export function isAssistantApplicable(appliesTo: string): boolean {
  return appliesTo === 'assistant' || appliesTo === 'all';
}

/**
 * True when the rule's effect is enforced through the capability algebra.
 *
 * Mirrors `policyFromRows`'s `isCapabilityRule`. The duplication is deliberate and is the reason
 * **T31** exists: if `policy-source.ts` ever widens which effects need a mapping, this predicate must
 * change with it, and the test that pins both is `tests/review/artifacts.test.ts`.
 */
export function isCapabilityRule(effect: string): boolean {
  return effect === 'ALLOW' || effect === 'PROHIBIT';
}

export function checkPolicyRuleCode(
  ruleCode: string,
  appliesTo: string,
  effect: string,
): PolicyRuleCodeCheck {
  if (!RULE_CODE_PATTERN.test(ruleCode)) {
    return {
      ok: false,
      message:
        'A rule code is 3-64 characters: a lower-case letter, then lower-case letters, digits or underscores.',
    };
  }

  const capabilities = capabilitiesForPolicyRuleCode(ruleCode);

  // An escalation or clarification rule needs no capability mapping, whatever its scope.
  if (!isCapabilityRule(effect)) {
    return capabilities === undefined ? { ok: true } : { ok: true, capabilities };
  }

  if (capabilities === undefined) {
    if (!isAssistantApplicable(appliesTo)) {
      // Inert for the Assistant, so it cannot cause POL_INVALID; the row is still worth writing.
      return { ok: true };
    }
    return {
      ok: false,
      message: `The rule code "${ruleCode}" has no guardrail capability mapping, so it would disable the Assistant for this assignment. Use a code the guardrail knows, or add the mapping in the same change.`,
    };
  }

  return { ok: true, capabilities };
}
