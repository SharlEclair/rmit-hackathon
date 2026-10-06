'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type {
  AssignmentHealthResponse,
  TutorDiscussionResponse,
  TutorQueryGroupListResponse,
  QueryThreadResponse,
} from '@/lib/api/types';

interface HubProps {
  assignmentId: string;
  assignmentTitle: string;
  assignmentStatus: string;
  courseCode?: string;
  initialQueries: TutorQueryGroupListResponse;
  initialDiscussion: TutorDiscussionResponse;
  initialHealth: AssignmentHealthResponse;
}

export function TutorAssignmentHub({
  assignmentId,
  assignmentTitle,
  assignmentStatus,
  courseCode,
  initialQueries,
  initialDiscussion,
  initialHealth,
}: HubProps) {
  const [activeTab, setActiveTab] = useState<'queries' | 'discussion' | 'analysis'>('queries');

  // Queries state
  const [queryGroups, setQueryGroups] = useState(initialQueries);
  const [selectedQueryId, setSelectedQueryId] = useState<string | null>(
    initialQueries.items[0]?.queries[0]?.id ?? null,
  );
  const [activeThread, setActiveThread] = useState<QueryThreadResponse | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(
    queryGroups.items[0]?.groupKey ?? null,
  );

  // Discussion state
  const [discussionData, setDiscussionData] = useState(initialDiscussion);
  const [discussionSubTab, setDiscussionSubTab] = useState<'threads' | 'faqs' | 'moderation'>(
    initialDiscussion.moderationQueue.length > 0 ? 'moderation' : 'threads',
  );
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [moderationActionId, setModerationActionId] = useState<string | null>(null);

  // Fetch thread messages when selectedQueryId changes
  useEffect(() => {
    if (!selectedQueryId) return;
    let isCurrent = true;

    fetch(`/api/tutor/queries/${selectedQueryId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: QueryThreadResponse | null) => {
        if (isCurrent && data) {
          setActiveThread(data);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isCurrent) setIsLoadingThread(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedQueryId]);

  // Total counts
  const totalOpenQueries = queryGroups.items.reduce((sum, g) => sum + g.openCount, 0);
  const pendingFlagsCount = discussionData.moderationQueue.length;
  const allQueries = queryGroups.items.flatMap((g) => g.queries);

  // Handle Query Reply
  const handleSendReply = async () => {
    if (!selectedQueryId || !replyText.trim()) return;
    setIsSubmittingReply(true);
    setReplyError(null);

    try {
      const res = await fetch(`/api/tutor/queries/${selectedQueryId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyText.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message ?? 'Failed to send reply');
      }

      setReplyText('');

      // Refresh current thread and groups
      const [tRes, qRes] = await Promise.all([
        fetch(`/api/tutor/queries/${selectedQueryId}`),
        fetch(`/api/tutor/assignments/${assignmentId}/queries`),
      ]);
      if (tRes.ok) setActiveThread(await tRes.json());
      if (qRes.ok) setQueryGroups(await qRes.json());
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Error replying');
    } finally {
      setIsSubmittingReply(false);
    }
  };

  // Handle Publish Query Reply to FAQ
  const handlePublishReplyToFaq = async (queryId: string) => {
    try {
      const res = await fetch(`/api/tutor/queries/${queryId}/publish`, {
        method: 'POST',
      });
      if (res.ok) {
        // Refresh discussions & queries
        const [dRes, qRes, tRes] = await Promise.all([
          fetch(`/api/tutor/assignments/${assignmentId}/discussions`),
          fetch(`/api/tutor/assignments/${assignmentId}/queries`),
          fetch(`/api/tutor/queries/${queryId}`),
        ]);
        if (dRes.ok) setDiscussionData(await dRes.json());
        if (qRes.ok) setQueryGroups(await qRes.json());
        if (tRes.ok) setActiveThread(await tRes.json());
      }
    } catch {
      // ignore
    }
  };

  // Handle Moderation Action
  const handleModerate = async (postId: string, action: 'approve' | 'remove') => {
    setModerationActionId(postId);
    try {
      const res = await fetch(`/api/tutor/discussion-posts/${postId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const dRes = await fetch(`/api/tutor/assignments/${assignmentId}/discussions`);
        if (dRes.ok) {
          setDiscussionData(await dRes.json());
        }
      }
    } catch {
      // ignore
    } finally {
      setModerationActionId(null);
    }
  };

  // Helper to format duration
  const formatDuration = (seconds: number | null) => {
    if (seconds === null) return '—';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = (mins / 60).toFixed(1);
    return `${hours}h`;
  };

  return (
    <div className="mx-auto max-w-6xl py-6 space-y-6">
      {/* Top Banner & Header */}
      <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-text-muted">
              {courseCode && <span>{courseCode}</span>}
              <span>•</span>
              <span className="capitalize">{assignmentStatus.replace('_', ' ')}</span>
            </div>
            <h1 className="mt-1 text-2xl md:text-3xl font-semibold tracking-tight text-text">
              {assignmentTitle}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/tutor/assignments/${assignmentId}/review`}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-bg px-4 py-2.5 text-sm font-medium text-text hover:border-primary/50 hover:text-primary transition-all duration-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Review Structure & Rubric
            </Link>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mt-8 flex border-b border-border">
          <button
            onClick={() => setActiveTab('queries')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${
              activeTab === 'queries'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            <span>Student Queries</span>
            {totalOpenQueries > 0 && (
              <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                {totalOpenQueries}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('discussion')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${
              activeTab === 'discussion'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            <span>Discussions & FAQs</span>
            {pendingFlagsCount > 0 && (
              <span className="rounded-full bg-danger/20 px-2 py-0.5 text-xs font-semibold text-danger">
                {pendingFlagsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('analysis')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all duration-200 border-b-2 -mb-px ${
              activeTab === 'analysis'
                ? 'border-primary text-primary'
                : 'border-transparent text-text-muted hover:text-text'
            }`}
          >
            <span>Cohort Analysis</span>
            {initialHealth.potentialDifficultyAreas.length > 0 && (
              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning">
                {initialHealth.potentialDifficultyAreas.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* TAB 1: QUERIES */}
      {activeTab === 'queries' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Query Group List */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted mb-3">
                Queries by Milestone ({allQueries.length})
              </h2>

              {queryGroups.items.length === 0 ? (
                <p className="py-6 text-center text-sm text-text-muted">No student queries submitted yet.</p>
              ) : (
                <div className="space-y-3">
                  {queryGroups.items.map((group) => {
                    const isExpanded = expandedGroup === group.groupKey;
                    return (
                      <div
                        key={group.groupKey || 'unassigned'}
                        className="rounded-lg border border-border/80 bg-bg/50 overflow-hidden"
                      >
                        <button
                          onClick={() => setExpandedGroup(isExpanded ? null : group.groupKey)}
                          className="flex w-full items-center justify-between p-3.5 text-left text-sm font-medium text-text hover:bg-surface/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <span className="truncate">{group.label}</span>
                            <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-text-muted border border-border">
                              {group.queryCount}
                            </span>
                          </div>
                          {group.openCount > 0 && (
                            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                              {group.openCount} open
                            </span>
                          )}
                        </button>

                        {isExpanded && (
                          <div className="border-t border-border/50 divide-y divide-border/40">
                            {group.queries.map((q) => {
                              const isSelected = selectedQueryId === q.id;
                              return (
                                <button
                                  key={q.id}
                                  onClick={() => {
                                    if (selectedQueryId !== q.id) {
                                      setIsLoadingThread(true);
                                      setSelectedQueryId(q.id);
                                    }
                                  }}
                                  className={`w-full p-3 text-left transition-all duration-150 ${
                                    isSelected
                                      ? 'bg-primary/10 border-l-2 border-primary'
                                      : 'hover:bg-surface/60'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate text-xs font-semibold text-text">
                                      {q.subject ?? 'Untitled Query'}
                                    </span>
                                    <span
                                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                                        q.status === 'open'
                                          ? 'bg-primary/20 text-primary'
                                          : q.status === 'answered'
                                          ? 'bg-success/20 text-success'
                                          : 'bg-surface text-text-muted border border-border'
                                      }`}
                                    >
                                      {q.status}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex items-center justify-between text-[11px] text-text-muted">
                                    <span>{q.messageCount} messages</span>
                                    <span>{new Date(q.createdAt).toLocaleDateString()}</span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Query Detail & Reply Panel */}
          <div className="lg:col-span-7">
            {isLoadingThread ? (
              <div className="flex h-64 items-center justify-center rounded-xl border border-border bg-surface p-6 text-sm text-text-muted">
                Loading query messages...
              </div>
            ) : activeThread ? (
              <div className="rounded-xl border border-border bg-surface p-6 shadow-sm space-y-6">
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${
                        activeThread.status === 'open'
                          ? 'bg-primary/20 text-primary'
                          : activeThread.status === 'answered'
                          ? 'bg-success/20 text-success'
                          : 'bg-surface text-text-muted border border-border'
                      }`}
                    >
                      Status: {activeThread.status}
                    </span>
                    <span className="text-xs text-text-muted">
                      Created: {new Date(activeThread.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <h2 className="mt-2 text-xl font-semibold text-text">
                    {activeThread.subject ?? 'Query Thread'}
                  </h2>
                </div>

                {/* Messages Feed */}
                <div className="space-y-4 max-h-[420px] overflow-y-auto pr-2">
                  {activeThread.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`rounded-lg border p-4 space-y-2 ${
                        msg.authorRole === 'tutor'
                          ? 'border-primary/40 bg-primary/5 ml-4'
                          : 'border-border bg-bg/60 mr-4'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs text-text-muted">
                        <span className="font-semibold text-text">
                          {msg.authorDisplayName}{' '}
                          {msg.authorRole === 'tutor' && (
                            <span className="text-primary">(Tutor)</span>
                          )}
                        </span>
                        <span>{new Date(msg.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-sm text-text whitespace-pre-wrap">{msg.body}</p>
                      {msg.publishedAsFaqEntryId && (
                        <div className="pt-1">
                          <span className="rounded bg-success/20 px-2 py-0.5 text-[10px] font-semibold text-success">
                            Published to FAQ
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Reply Form */}
                <div className="pt-4 border-t border-border space-y-4">
                  <h3 className="text-sm font-semibold text-text">Tutor Reply</h3>
                  {replyError && (
                    <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
                      {replyError}
                    </div>
                  )}
                  <textarea
                    rows={3}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type your official response grounded in the assignment requirements..."
                    className="w-full rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handlePublishReplyToFaq(activeThread.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text hover:bg-bg transition-colors"
                    >
                      <svg className="h-3.5 w-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Promote to FAQ
                    </button>

                    <button
                      type="button"
                      disabled={isSubmittingReply || !replyText.trim()}
                      onClick={handleSendReply}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      {isSubmittingReply ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center text-sm text-text-muted">
                Select a student query from the list to view the conversation.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DISCUSSIONS & FAQS */}
      {activeTab === 'discussion' && (
        <div className="space-y-6">
          {/* Sub Navigation */}
          <div className="flex gap-2 border-b border-border pb-3">
            <button
              onClick={() => setDiscussionSubTab('threads')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                discussionSubTab === 'threads'
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border text-text-muted hover:text-text'
              }`}
            >
              Student Threads ({discussionData.threads.length})
            </button>
            <button
              onClick={() => setDiscussionSubTab('faqs')}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                discussionSubTab === 'faqs'
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border text-text-muted hover:text-text'
              }`}
            >
              Official FAQs ({discussionData.officialFaq.length})
            </button>
            <button
              onClick={() => setDiscussionSubTab('moderation')}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all duration-200 ${
                discussionSubTab === 'moderation'
                  ? 'bg-primary text-white'
                  : 'bg-surface border border-border text-text-muted hover:text-text'
              }`}
            >
              <span>Moderation Queue</span>
              {discussionData.moderationQueue.length > 0 && (
                <span className="rounded-full bg-danger px-1.5 py-0.2 text-[10px] text-white">
                  {discussionData.moderationQueue.length}
                </span>
              )}
            </button>
          </div>

          {/* Moderation Queue Sub-view */}
          {discussionSubTab === 'moderation' && (
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="text-base font-semibold text-text mb-4">Pending Flagged Posts</h2>
              {discussionData.moderationQueue.length === 0 ? (
                <div className="py-12 text-center text-sm text-text-muted">
                  The moderation queue is clear. No posts currently flagged for review.
                </div>
              ) : (
                <div className="space-y-4">
                  {discussionData.moderationQueue.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-danger/30 bg-danger/5 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded bg-danger/20 px-2 py-0.5 text-xs font-semibold uppercase text-danger">
                          Flag: {item.reasonCode.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-text-muted">
                          Severity: <strong className="uppercase">{item.severity}</strong> •{' '}
                          {new Date(item.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted">
                        Post ID: <span className="mono text-text">{item.targetId}</span>
                      </p>
                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          disabled={moderationActionId === item.targetId}
                          onClick={() => handleModerate(item.targetId, 'remove')}
                          className="rounded-lg border border-danger/40 bg-surface px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger/10 transition-colors"
                        >
                          Remove Post
                        </button>
                        <button
                          disabled={moderationActionId === item.targetId}
                          onClick={() => handleModerate(item.targetId, 'approve')}
                          className="rounded-lg bg-success px-3.5 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-success/90 transition-colors"
                        >
                          Approve (Restore)
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Student Threads Sub-view */}
          {discussionSubTab === 'threads' && (
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="text-base font-semibold text-text mb-4">Active Discussion Threads</h2>
              {discussionData.threads.length === 0 ? (
                <p className="py-12 text-center text-sm text-text-muted">No discussion threads initiated.</p>
              ) : (
                <div className="space-y-4">
                  {discussionData.threads.map((thread) => {
                    const isExpanded = expandedThreadId === thread.id;
                    return (
                      <div
                        key={thread.id}
                        className="rounded-lg border border-border bg-bg/50 p-4 transition-all duration-200"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-text">{thread.title}</h3>
                            <p className="text-xs text-text-muted mt-1">
                              By {thread.author.displayLabel} • {thread.postCount} replies
                            </p>
                          </div>
                          <button
                            onClick={() => setExpandedThreadId(isExpanded ? null : thread.id)}
                            className="rounded-lg border border-border bg-surface px-3 py-1 text-xs font-medium text-text hover:bg-bg transition-colors"
                          >
                            {isExpanded ? 'Hide' : 'View Thread'}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-border/60 space-y-3">
                            {thread.posts.map((post) => (
                              <div
                                key={post.id}
                                className="rounded-lg border border-border/80 bg-surface p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between text-xs text-text-muted">
                                  <span className="font-medium text-text">{post.author.displayLabel}</span>
                                  <span>{new Date(post.createdAt).toLocaleTimeString()}</span>
                                </div>
                                <p className="text-sm text-text">{post.body ?? '[Content pending moderation]'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Official FAQs Sub-view */}
          {discussionSubTab === 'faqs' && (
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <h2 className="text-base font-semibold text-text mb-4">Official Assignment FAQs</h2>
              {discussionData.officialFaq.length === 0 ? (
                <p className="py-12 text-center text-sm text-text-muted">No official FAQs published yet.</p>
              ) : (
                <div className="space-y-4">
                  {discussionData.officialFaq.map((faq) => (
                    <div key={faq.id} className="rounded-lg border border-border bg-bg/50 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                          {faq.sourceKind.replace('_', ' ')}
                        </span>
                        <span className="rounded bg-success/20 px-2 py-0.5 text-[10px] font-semibold text-success">
                          Published
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-text">{faq.question}</h3>
                      <p className="text-sm text-text-muted whitespace-pre-wrap">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: COHORT ANALYSIS */}
      {activeTab === 'analysis' && (
        <div className="space-y-6">
          {/* Headline Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <span className="text-xs text-text-muted font-medium">Enrolled Cohort</span>
              <p className="mt-2 text-2xl font-bold text-text">
                {initialHealth.headline.enrolledCount}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <span className="text-xs text-text-muted font-medium">Active Students</span>
              <p className="mt-2 text-2xl font-bold text-text">
                {initialHealth.headline.activeCount ?? '—'}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <span className="text-xs text-text-muted font-medium">Avg Completion Rate</span>
              <p className="mt-2 text-2xl font-bold text-text">
                {initialHealth.headline.averageCompletionRate !== null
                  ? `${Math.round(initialHealth.headline.averageCompletionRate * 100)}%`
                  : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <span className="text-xs text-text-muted font-medium">Difficulty Alerts</span>
              <p className="mt-2 text-2xl font-bold text-warning">
                {initialHealth.potentialDifficultyAreas.length}
              </p>
            </div>
          </div>

          {/* Difficulty Signal Alert Cards */}
          {initialHealth.potentialDifficultyAreas.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-warning">
                Detected Bottlenecks & Alerts
              </h2>
              {initialHealth.potentialDifficultyAreas.map((area) => (
                <div
                  key={area.milestoneId}
                  className="rounded-xl border border-warning/40 bg-warning/10 p-5 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warning text-bg text-xs font-bold">
                      !
                    </span>
                    <h3 className="text-base font-semibold text-warning">
                      Potential difficulty detected — {area.milestoneTitle}
                    </h3>
                  </div>
                  <p className="mt-2 text-sm text-text">{area.reason}</p>
                  <div className="mt-3 flex items-center gap-6 text-xs text-text-muted">
                    <span>Avg Time: {formatDuration(area.averageElapsedSeconds)}</span>
                    <span>Tutor Questions: {area.questionCount}</span>
                    <span>Completion: {Math.round(area.completionRate * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Milestone Metrics Table */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm overflow-hidden">
            <h2 className="text-base font-semibold text-text mb-4">Milestone Progress & Signals</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-text">
                <thead className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
                  <tr>
                    <th className="py-3 px-4">Milestone</th>
                    <th className="py-3 px-4">Avg Elapsed Time</th>
                    <th className="py-3 px-4">Completion %</th>
                    <th className="py-3 px-4">Questions</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {initialHealth.milestones.map((m) => (
                    <tr key={m.milestoneId} className="hover:bg-bg/40 transition-colors">
                      <td className="py-3.5 px-4 font-medium text-text">{m.milestoneTitle}</td>
                      <td className="py-3.5 px-4 text-text-muted">
                        {formatDuration(m.averageElapsedSeconds)}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-20 overflow-hidden rounded-full bg-bg">
                            <div
                              className="h-full bg-primary"
                              style={{
                                width: `${Math.round((m.completionRate ?? 0) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-text-muted">
                            {m.completionRate !== null
                              ? `${Math.round(m.completionRate * 100)}%`
                              : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-text-muted">{m.questionCount ?? 0}</td>
                      <td className="py-3.5 px-4">
                        {m.dataState === 'ready' ? (
                          <span className="rounded-full bg-success/20 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                            Active Data
                          </span>
                        ) : (
                          <span className="rounded-full bg-surface border border-border px-2.5 py-0.5 text-[11px] text-text-muted">
                            Collecting Signals
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
