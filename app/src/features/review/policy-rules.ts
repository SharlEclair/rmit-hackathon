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
 * **Scope of the check.** Only an assistant-applicable rule (`applies_to` of `assistant` or `all`) is
 * checked. A `uploads`- or `discussion`-scoped code that the mapping does not know is inert for the
 * Assistant by construction (`05` section 3.3.1 contributes only rules whose `applies_to` includes
 * `assistant`), so refusing it would invent a restriction `06` does not have.
 *
 * **No new export is needed from `src/lib/guardrail/`.** `capabilitiesForPolicyRuleCode` is already
 * exported for the refusal renderer, so the guard reads the same table the guardrail computes with
 * and cannot drift from it. The policy editor therefore offers the codes the bundle already contains
 * (the Analyst's proposals and the seeded policy) plus free text, and this guard is what makes a
 * wrong code impossible to persist.
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

export function checkPolicyRuleCode(ruleCode: string, appliesTo: string): PolicyRuleCodeCheck {
  if (!RULE_CODE_PATTERN.test(ruleCode)) {
    return {
      ok: false,
      message:
        'A rule code is 3-64 characters: a lower-case letter, then lower-case letters, digits or underscores.',
    };
  }

  const capabilities = capabilitiesForPolicyRuleCode(ruleCode);
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
