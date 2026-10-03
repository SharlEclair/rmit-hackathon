-- 0003_assignment_sources.sql
--
-- Assignment definition, part 1: `assignments`, `assignment_sources`, `source_chunks`
-- (06 sections 7.2.1-7.2.3; spec schema.md 2.2).
--
-- Privacy classes (06 section 4.6; stated here because 6.7 rule 4 requires the class in a SQL
-- comment -- the class determines which modules may read the table):
--   assignments        identity-free
--   assignment_sources identity-free (the uploader is a tutor, not a student; the tutor's own
--                                     name is not analytics data)
--   source_chunks      identity-free
--
-- Deliberately absent from this file:
--   1. `assignments.current_structure_id`'s FK. It is circular with
--      `assignment_structures.assignment_id`, so the column is declared here and the constraint
--      is added by `0004_structure.sql` once the parent table exists (spec schema.md 0.4).
--   2. `source_chunks.embedding vector(1536)`. 06 section 6.8 rule 4 and 7.2.3 keep it out of
--      the base migration; it is added by an optional, non-default migration and the retrieval
--      path must work with the column absent. Nothing in the default chain references `vector`
--      (decision A14).
--
-- No destructive statement appears in this file.

-- ---------------------------------------------------------------------------------------------
-- assignments -- 06 section 7.2.1 -- class: identity-free
--
-- The central object (D1). `status` is a different field from `publication_status` and the two
-- are never interchangeable (3.6); a student read requires `status = 'published'` (G1, 3.4).
-- ---------------------------------------------------------------------------------------------
create table assignments (
  id                   uuid primary key default gen_random_uuid(),
  course_id            uuid not null
                         constraint fk_assignments_courses references courses (id) on delete restrict,
  title                text not null
                         constraint ck_assignments_title_length check (length(title) between 1 and 200),
  status               text not null default 'draft'
                         constraint ck_assignments_status check (
                           status in ('draft','ingesting','in_review','published','archived')),
  due_at               timestamptz,
  created_by_user_id   uuid not null
                         constraint fk_assignments_users references users (id) on delete restrict,
  -- FK added by alter table in 0004_structure.sql; see the header note (circular, schema.md 0.4).
  -- "maintained alongside is_current" (7.2.1).
  current_structure_id uuid,
  published_at         timestamptz
                         constraint ck_assignments_published_at check (
                           status <> 'published' or published_at is not null),
  archived_at          timestamptz
                         constraint ck_assignments_archived_at check (
                           status <> 'archived' or archived_at is not null),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 06 section 6.6
create index idx_assignments_course_status on assignments (course_id, status);

-- ---------------------------------------------------------------------------------------------
-- assignment_sources -- 06 section 7.2.2 -- class: identity-free
--
-- A tutor-uploaded source document; T1 material. At least one source with `kind = 'brief'` is
-- required before publish. `storage_key` is opaque and driver-relative, and is never returned by
-- an API (I-7, 6.9 rule 2).
-- ---------------------------------------------------------------------------------------------
create table assignment_sources (
  id                  uuid primary key default gen_random_uuid(),
  assignment_id       uuid not null
                        constraint fk_assignment_sources_assignments references assignments (id) on delete restrict,
  uploaded_by_user_id uuid not null
                        constraint fk_assignment_sources_users references users (id) on delete restrict,
  kind                text not null
                        constraint ck_assignment_sources_kind check (
                          kind in ('brief','rubric','ai_policy','marking_guide','supplementary')),
  original_filename   text not null
                        constraint ck_assignment_sources_filename_length check (length(original_filename) <= 255),
  storage_key         text not null,
  -- Reading applied: the wider D57 set, not the narrower prose list in 7.2.2.
  -- 06 section 7.2.2's prose enumerates only PDF, DOCX, PPTX and PNG/JPEG, but the same row
  -- points at O5, and O5 as confirmed by D57 also accepts plain text and Markdown. 06 section 10
  -- item 13 records that resolution ("02 section 2.4 now states the O5 set and does not narrow
  -- it"). The prose CHECK text is therefore the stale side of that conflict (handoff I-17); the
  -- CHECK below implements O5/D57.
  mime_type           text not null
                        constraint ck_assignment_sources_mime check (mime_type in (
                          'application/pdf',
                          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                          'image/png',
                          'image/jpeg',
                          'text/plain',
                          'text/markdown')),
  byte_size           bigint not null
                        constraint ck_assignment_sources_byte_size check (
                          byte_size > 0 and byte_size <= 26214400),
  page_count          integer
                        constraint ck_assignment_sources_page_count check (
                          page_count is null or page_count >= 0),
  -- SHA-256 of the stored bytes, 64 hex characters; used for duplicate detection (6.9 rule 4).
  content_hash        text not null
                        constraint ck_assignment_sources_content_hash check (length(content_hash) = 64),
  extraction_status   text not null default 'pending'
                        constraint ck_assignment_sources_extraction_status check (
                          extraction_status in ('pending','extracting','extracted','failed')),
  -- A message safe to show a tutor, never a stack trace.
  extraction_error    text
                        constraint ck_assignment_sources_extraction_error_length check (
                          extraction_error is null or length(extraction_error) <= 500),
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- DERIVED name: 7.2.2 says `storage_key` is "unique" but does not name the object; 6.1's
  -- `uq_<table>_<columns>` convention gives this one.
  constraint uq_assignment_sources_storage_key unique (storage_key)
);

-- 06 section 6.6. Partial: a soft-deleted source (6.5) is not in the tutor's active list.
create index idx_assignment_sources_assignment
  on assignment_sources (assignment_id) where deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- source_chunks -- 06 section 7.2.3 -- class: identity-free
--
-- A retrieved, page-located fragment of a T1 document; the grounding unit for every AI artifact
-- and every citation. This table is the only source of T1 text for the Map and for citations
-- (6.8, D38).
-- ---------------------------------------------------------------------------------------------
create table source_chunks (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null
                  constraint fk_source_chunks_assignments references assignments (id) on delete restrict,
  -- 6.4 Exception 1, and the only CASCADE in the schema: chunks are owned entirely by their
  -- source and are deleted with it before publish.
  source_id     uuid not null
                  constraint fk_source_chunks_sources references assignment_sources (id) on delete cascade,
  chunk_index   integer not null
                  constraint ck_source_chunks_chunk_index check (chunk_index >= 0),
  -- Verbatim extract, never rewritten (R2).
  text          text not null
                  constraint ck_source_chunks_text_length check (length(text) > 0),
  page_from     integer
                  constraint ck_source_chunks_page_from check (page_from is null or page_from >= 1),
  page_to       integer
                  constraint ck_source_chunks_page_to check (
                    page_to is null or page_from is null or page_to >= page_from),
  -- The document's own heading text where the extractor found one.
  section_label text
                  constraint ck_source_chunks_section_label_length check (
                    section_label is null or length(section_label) <= 200),
  char_count    integer not null
                  constraint ck_source_chunks_char_count check (char_count > 0),
  -- 6.8 rule 1: a stored generated column. Ingestion never writes it.
  search_tsv    tsvector generated always as (to_tsvector('english', text)) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint uq_source_chunks_source_chunk unique (source_id, chunk_index)
);

-- 06 section 6.6
create index idx_source_chunks_source on source_chunks (source_id, chunk_index);
create index idx_source_chunks_search_tsv on source_chunks using gin (search_tsv);
