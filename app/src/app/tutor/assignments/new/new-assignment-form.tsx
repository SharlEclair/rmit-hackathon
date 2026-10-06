'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export interface CourseOption {
  id: string;
  code: string;
  title: string;
  term: string;
}

interface FileWithKind {
  file: File;
  kind: 'brief' | 'rubric' | 'ai_policy' | 'marking_guide' | 'supplementary';
}

interface IngestionJobStatus {
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  stage: string | null;
  completedStages: number;
  totalStages: number;
  error: { code: string; message: string } | null;
}

const STAGE_STEPS = [
  { id: 'extract', label: 'Extracting text from documents...', stages: ['S0', 'S1'] },
  { id: 'structure', label: 'Analyzing document structure & content...', stages: ['S2', 'S3'] },
  { id: 'milestones', label: 'Identifying milestones & deliverables...', stages: ['S4'] },
  { id: 'ambiguities', label: 'Detecting ambiguities & policy guidelines...', stages: ['S5', 'S6'] },
  { id: 'review', label: 'Assembling review package...', stages: ['S7'] },
];

export function NewAssignmentForm({ courses }: { courses: CourseOption[] }) {
  const router = useRouter();

  // Stage state: 'upload' | 'processing'
  const [currentStage, setCurrentStage] = useState<'upload' | 'processing'>('upload');

  // Form inputs
  const [title, setTitle] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id ?? '');
  const [fileList, setFileList] = useState<FileWithKind[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Processing state
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<IngestionJobStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const addFiles = (newFiles: FileList | File[]) => {
    const acceptedFiles = Array.from(newFiles).filter((f) => f.size > 0);
    const mapped: FileWithKind[] = acceptedFiles.map((f, idx) => {
      let defaultKind: FileWithKind['kind'] = 'supplementary';
      const name = f.name.toLowerCase();
      if (fileList.length === 0 && idx === 0) defaultKind = 'brief';
      else if (name.includes('rubric')) defaultKind = 'rubric';
      else if (name.includes('policy') || name.includes('ai')) defaultKind = 'ai_policy';
      else if (name.includes('guide') || name.includes('mark')) defaultKind = 'marking_guide';
      else if (name.includes('brief') || name.includes('spec')) defaultKind = 'brief';

      return { file: f, kind: defaultKind };
    });

    setFileList((prev) => [...prev, ...mapped]);
    setErrorMsg(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      addFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setFileList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateFileKind = (index: number, kind: FileWithKind['kind']) => {
    setFileList((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, kind } : item)),
    );
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Please enter an assignment title.');
      return;
    }
    if (fileList.length === 0) {
      setErrorMsg('Please upload at least one assignment document.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const formData = new FormData();
      formData.append('title', title.trim());
      formData.append('courseId', selectedCourseId);

      const kindsMap: Record<string, string> = {};
      fileList.forEach((item) => {
        formData.append('files', item.file);
        formData.append('kinds', item.kind);
        kindsMap[item.file.name] = item.kind;
      });
      formData.append('kindsJson', JSON.stringify(kindsMap));

      const res = await fetch('/api/assignments', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message ?? `Upload failed with status ${res.status}`);
      }

      const data = await res.json();
      setAssignmentId(data.assignmentId);
      setCurrentStage('processing');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'An error occurred during submission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Polling in Stage 2
  useEffect(() => {
    if (currentStage !== 'processing' || !assignmentId) return;

    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/assignments/${assignmentId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (!isMounted) return;

        if (data.job) {
          setJobStatus(data.job);
          if (data.job.status === 'succeeded') {
            clearInterval(interval);
            setTimeout(() => {
              router.push(`/tutor/assignments/${assignmentId}/review`);
            }, 1000);
          } else if (data.job.status === 'failed') {
            clearInterval(interval);
          }
        }
      } catch {
        // Continue polling on transient network glitch
      }
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentStage, assignmentId, router]);

  // Stage 2 helper
  const getStepStatus = (stepStages: string[], stepIdx: number) => {
    if (!jobStatus) return 'waiting';
    if (jobStatus.status === 'succeeded') return 'completed';
    if (jobStatus.status === 'failed') return 'failed';

    const currentStageCode = jobStatus.stage ?? 'S0';
    if (stepStages.includes(currentStageCode)) return 'active';

    // Prior stages completed
    const currentStepIndex = STAGE_STEPS.findIndex((s) => s.stages.includes(currentStageCode));
    if (currentStepIndex > stepIdx) return 'completed';

    return 'waiting';
  };

  return (
    <div className="mx-auto max-w-4xl py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          {currentStage === 'upload' ? 'Upload New Assignment' : 'Analyzing Assignment'}
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          {currentStage === 'upload'
            ? 'Upload assignment documents for AI structure extraction, milestone generation, and ambiguity detection.'
            : 'The Assignment Analyst is processing the documents. You will be redirected to review once complete.'}
        </p>
      </div>

      {errorMsg && (
        <div className="mb-6 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {errorMsg}
        </div>
      )}

      {currentStage === 'upload' ? (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Assignment Title */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <label htmlFor="assignment-title" className="block text-sm font-medium text-text">
              Assignment Title <span className="text-danger">*</span>
            </label>
            <input
              id="assignment-title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Assignment 2: Scalable Microservices Architecture"
              className="mt-2 block w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />

            {/* Course Selector */}
            {courses.length > 1 && (
              <div className="mt-5">
                <label htmlFor="course-select" className="block text-sm font-medium text-text">
                  Course
                </label>
                <select
                  id="course-select"
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="mt-2 block w-full rounded-lg border border-border bg-bg px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}: {c.title} ({c.term})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Document Upload Dropzone */}
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-base font-semibold text-text">Assignment Documents</h2>
            <p className="mt-1 text-xs text-text-muted">
              Supported formats: PDF, DOCX, PPTX, PNG, JPG, Plain Text, Markdown (max 25MB each).
            </p>

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border/80 hover:border-primary/50 hover:bg-bg/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                }}
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
              </div>
              <p className="mt-3 text-sm font-medium text-text">
                Click to browse or drag and drop assignment files here
              </p>
              <p className="mt-1 text-xs text-text-muted">
                Add assignment briefs, rubrics, guides, and policy documents
              </p>
            </div>

            {/* File List */}
            {fileList.length > 0 && (
              <div className="mt-6 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Attached Files ({fileList.length})
                </h3>
                {fileList.map((item, idx) => (
                  <div
                    key={`${item.file.name}-${idx}`}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border bg-bg/60 p-3.5 transition-all duration-200"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface text-xs font-semibold uppercase text-primary border border-border">
                        {item.file.name.split('.').pop()?.slice(0, 4) || 'FILE'}
                      </span>
                      <div className="truncate">
                        <p className="truncate text-sm font-medium text-text">{item.file.name}</p>
                        <p className="text-xs text-text-muted">
                          {(item.file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <select
                        value={item.kind}
                        onChange={(e) => updateFileKind(idx, e.target.value as FileWithKind['kind'])}
                        className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs text-text focus:border-primary focus:outline-none"
                      >
                        <option value="brief">Assignment Brief</option>
                        <option value="rubric">Marking Rubric</option>
                        <option value="ai_policy">AI Usage Policy</option>
                        <option value="marking_guide">Marking Guide</option>
                        <option value="supplementary">Supplementary Material</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="rounded p-1 text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                        title="Remove file"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isSubmitting || fileList.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {isSubmitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Uploading...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Start AI Ingestion & Analysis
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        /* Stage 2 -- Processing View */
        <div className="rounded-xl border border-border bg-surface p-8 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text">Processing Assignment Pipeline</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Current stage: {jobStatus?.stage ?? 'Initiating...'} (Completed {jobStatus?.completedStages ?? 0} of {jobStatus?.totalStages ?? 8} stages)
              </p>
            </div>
            {jobStatus?.status === 'succeeded' && (
              <span className="rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
                Ingestion Completed
              </span>
            )}
            {jobStatus?.status === 'failed' && (
              <span className="rounded-full bg-danger/15 px-3 py-1 text-xs font-semibold text-danger">
                Ingestion Failed
              </span>
            )}
            {(!jobStatus || jobStatus.status === 'running' || jobStatus.status === 'queued') && (
              <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary animate-pulse">
                In Progress
              </span>
            )}
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-bg mb-8">
            <div
              className="h-full bg-primary transition-all duration-500 ease-out"
              style={{
                width: jobStatus
                  ? `${Math.max(10, Math.min(100, ((jobStatus.completedStages + 1) / (jobStatus.totalStages || 8)) * 100))}%`
                  : '10%',
              }}
            />
          </div>

          {/* Stepper */}
          <div className="space-y-4">
            {STAGE_STEPS.map((step, idx) => {
              const status = getStepStatus(step.stages, idx);
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-4 rounded-lg border p-3.5 transition-all duration-200 ${
                    status === 'active'
                      ? 'border-primary/50 bg-primary/5 text-text'
                      : status === 'completed'
                      ? 'border-border bg-bg/40 text-text'
                      : 'border-border/40 bg-bg/20 text-text-muted opacity-60'
                  }`}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                    {status === 'completed' ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success/20 text-success">
                        ✓
                      </span>
                    ) : status === 'active' ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white animate-pulse">
                        {idx + 1}
                      </span>
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface border border-border text-text-muted">
                        {idx + 1}
                      </span>
                    )}
                  </div>

                  <div className="flex-1">
                    <p className="text-sm font-medium">{step.label}</p>
                  </div>

                  {status === 'active' && (
                    <svg className="h-4 w-4 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>

          {jobStatus?.status === 'failed' && (
            <div className="mt-8 rounded-lg border border-danger/40 bg-danger/10 p-4">
              <p className="text-sm font-semibold text-danger">Ingestion Encountered an Error</p>
              <p className="mt-1 text-xs text-danger/80">
                {jobStatus.error?.message ?? 'The pipeline failed to extract structure.'}
              </p>
              <button
                onClick={() => setCurrentStage('upload')}
                className="mt-4 rounded-lg bg-surface border border-border px-4 py-2 text-xs font-medium text-text hover:bg-bg transition-colors"
              >
                ← Back to Upload
              </button>
            </div>
          )}

          {jobStatus?.status === 'succeeded' && (
            <div className="mt-8 rounded-lg border border-success/40 bg-success/10 p-4 text-center">
              <p className="text-sm font-medium text-success">Analysis complete! Redirecting to tutor review...</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
