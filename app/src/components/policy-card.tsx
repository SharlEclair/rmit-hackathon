import type { AiPolicyResponse } from '@/lib/api/types';
import { ContentClassPanel } from '@/components/ui/content-class-panel';

/**
 * The published AI Usage Policy card (`07` UI-UX-SPEC section 4.2.1).
 *
 * Five rules shape it, and each is visible in the markup:
 *
 *   1. "The card is present only when at least one policy rule is `PUBLISHED`. Before that **the card
 *      is absent** and the Assistant is in the unavailable state" (rule 1). An earlier revision
 *      rendered the unavailable sentence here instead, reasoning that an empty card would read as "the
 *      policy places no limits". The worry is real, but the sentence already appears -- `AssistantPanel`
 *      renders `STATE_COPY.refusalUnavailable` whenever `policyAvailable` is false -- so rendering it
 *      here as well printed the same lines twice on one screen, and the rule says absent. Absence is
 *      safe precisely because the Assistant covers the state.
 *   2. "Each rule is shown verbatim, exactly as the tutor approved it. The interface never summarises,
 *      merges, or rewords a rule, and never presents a policy rule as an assignment requirement"
 *      (rule 2). `ruleText` is rendered as it is stored, in its own row, with no grouping.
 *   3. "The card carries the T2 treatment and the `Published by your tutor` label" (rule 3). That is
 *      the `approved` content class, whose marker and badge come from `fixed-strings.ts`.
 *   4. "The card has no edit, approve, or dismiss control" (rule 4). There is no button in this file.
 *   5. "The card is not part of the Assistant's transcript and the Assistant never cites itself as the
 *      policy's author" (rule 5). The assistant panel reads the policy from its own request, not here.
 */
export function PolicyCard(props: { readonly policy: AiPolicyResponse }) {
  if (!props.policy.available) {
    // Absent, not empty -- `07` section 4.2.1 rule 1 and its Empty row. The unavailable state is the
    // Assistant's to show, and it does (`assistant-panel.tsx`, the `policyAvailable` branch).
    return null;
  }

  return (
    <ContentClassPanel
      contentClass="approved"
      publishedOn={props.policy.publishedAt === null ? 'an earlier date' : props.policy.publishedAt.slice(0, 10)}
      title="AI usage policy"
    >
      <ul className="flex flex-col gap-3">
        {props.policy.rules.map((rule) => (
          <li key={rule.id} className="flex flex-col gap-1">
            {/* The tutor's own wording, verbatim. No paraphrase, no summary, no merge (rule 2). */}
            <p className="body measure-sans text-ink">{rule.ruleText}</p>
            <p className="mono-sm text-muted">
              {effectLabel(rule.effect)} - applies to {appliesToLabel(rule.appliesTo)}
            </p>
          </li>
        ))}
      </ul>
    </ContentClassPanel>
  );
}

/**
 * The effect in a student's words.
 *
 * `06` section 5.5.7 gives four values and no copy, and `07` section 2.4 item 14 forbids promising
 * something the system does not keep, so these are plain descriptions of what the rule does to a
 * request rather than a guarantee about outcomes.
 */
function effectLabel(effect: AiPolicyResponse['rules'][number]['effect']): string {
  switch (effect) {
    case 'PROHIBIT':
      return 'Not permitted';
    case 'ALLOW':
      return 'Permitted';
    case 'ESCALATE_TO_TUTOR':
      return 'Ask your tutor';
    default:
      return 'May need clarification';
  }
}

function appliesToLabel(appliesTo: AiPolicyResponse['rules'][number]['appliesTo']): string {
  switch (appliesTo) {
    case 'assistant':
      return 'the Assistant';
    case 'uploads':
      return 'uploads';
    case 'discussion':
      return 'discussions';
    default:
      return 'everything in this assignment';
  }
}
