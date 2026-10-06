'use client';

import { useEffect, useState } from 'react';
import type { ProactiveMessageResponse } from '@/lib/api/types';
import { AssistantPanel } from '@/components/assistant-panel';

interface ProactiveAssistantProps {
  assignmentId: string;
  policyAvailable: boolean;
  activeMilestoneId?: string | null;
  activeMilestoneTitle?: string | null;
}

export function ProactiveAssistant({
  assignmentId,
  policyAvailable,
  activeMilestoneId = null,
  activeMilestoneTitle = null,
}: ProactiveAssistantProps) {
  const [proactive, setProactive] = useState<ProactiveMessageResponse | null>(null);
  const [milestoneId, setMilestoneId] = useState<string | null>(activeMilestoneId);
  const [milestoneTitle, setMilestoneTitle] = useState<string | null>(activeMilestoneTitle);

  // Fetch proactive notice when mounted or milestone changed
  useEffect(() => {
    let cancelled = false;
    const url = milestoneId
      ? `/api/student/assignments/${assignmentId}/assistant/proactive?milestoneId=${encodeURIComponent(milestoneId)}`
      : `/api/student/assignments/${assignmentId}/assistant/proactive`;

    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProactiveMessageResponse | null) => {
        if (!cancelled && data) {
          setProactive(data);
          setMilestoneTitle((prev) => prev || data.milestoneTitle);
          setMilestoneId((prev) => prev || data.milestoneId);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [assignmentId, milestoneId]);

  // Listen for milestone changes from checklist item transitions
  useEffect(() => {
    const handleMilestoneChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ milestoneId: string; milestoneTitle: string }>;
      if (customEvent.detail) {
        setMilestoneId(customEvent.detail.milestoneId);
        setMilestoneTitle(customEvent.detail.milestoneTitle);
      }
    };

    window.addEventListener('assignmate:milestone-change', handleMilestoneChange);
    return () => {
      window.removeEventListener('assignmate:milestone-change', handleMilestoneChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = () => {
    if (proactive?.noticeId) {
      fetch(`/api/student/assistant/proactive-messages/${proactive.noticeId}/dismiss`, {
        method: 'POST',
      }).catch(() => {});
    }
    setProactive(null);
  };

  return (
    <AssistantPanel
      assignmentId={assignmentId}
      policyAvailable={policyAvailable}
      milestoneId={milestoneId}
      milestoneTitle={milestoneTitle}
      proactive={proactive}
      onDismissProactive={handleDismiss}
    />
  );
}
