# AssignMate - Technical Specification

## 1. Overview
AssignMate is an AI-native assignment workspace for university students and tutors.
This document supersedes previous specification documents and serves as the single source of truth for the project.

## 2. Core Architecture & Routes

### 2.1 Tutor Workspace
- `/tutor/assignments/[id]/page.tsx`: The main tutor assignment hub with three horizontal tabs:
  - **Queries**: Manage incoming student queries, AI-grouped clusters, private replies, and FAQ publishing.
  - **Discussions**: Monitor peer conversations, review AI moderation flags, approve student answers, manage FAQs.
  - **Analysis**: Visualize cohort progress, identify bottlenecks, act on difficulty alerts.
- `/tutor/assignments/new`: Tutor Ingestion Upload Page. Contains a file dropzone with real-time processing indicator for assignments, rubrics, and PDFs.

### 2.2 Student Workspace
- `/student/assignments/[id]/`: The main student assignment hub with four tabs: Assignment/Info, My Queries, Discussions, Checklist.
- **Visual Document Viewer**: A realistic visual document viewer for PDF and DOCX files to retain the original formatting, typography, and layout of the assignment brief.
- **Proactive Assistant**: Proactively shows 2-3 key assignment considerations when entering a milestone.

## 3. Data Models
- **Tutor**: Has full visibility of aggregate metrics and assignment settings.
- **Student**: Operates with privacy. Uploads files (Text, Image, Audio, Video, PDF).
- **Assignments**: Consist of multiple milestones, associated FAQs, and discussions.
- **AI Constraints**: LLM limits and anonymity thresholds are standard and practical. There is NO k-anonymity floor of 5, nor a strict 12-call LLM session hardcap.

## 4. Visual Design System
- **Aesthetic**: Modern, polished web interface resembling a high-end SaaS product.
- **UI Framework**: TailwindCSS with clean cards, subtle borders, soft shadows, rounded corners, and modern typography (e.g., Inter or Plus Jakarta Sans).
- **Interactions**: Smooth micro-interactions (hover states, transitions).
- **Restrictions Removed**: No "Institutional Editorial" dogma. No artificial border restrictions (T1-T5 rules are abolished).

## 5. UI-First Development Protocol
1. For every feature, the frontend Next.js page (`page.tsx`) and visual components MUST be created first with realistic mockup data.
2. Backend API routes or database services MUST NOT be written until the frontend page exists, is styled, and has been visually verified in the browser.
