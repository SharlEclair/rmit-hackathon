-- 0002_identity.sql
--
-- Identity and access: `users`, `courses`, `enrollments` (06 section 7.1; spec schema.md 2.1).
--
-- Privacy classes (06 section 4.6; stated here because 6.7 rule 4 requires the class in a SQL
-- comment -- the class determines which modules may read the table):
--   users        identity-bearing
--   courses      identity-free
--   enrollments  identity-bearing
--
-- Enum representation (06 section 6.3, NORMATIVE): every enum-ish column below is `text` plus a
-- named CHECK. No `create type ... as enum` is used anywhere in this migration chain, because
-- adding a value must stay a one-line CHECK replacement.
--
-- No destructive statement appears in this file.

-- 6.2 rule 1: gen_random_uuid() requires Postgres >= 13 or pgcrypto. Postgres 18.6 (D66) has it
-- built in, so this is a portability no-op rather than a real dependency.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------------------------
-- users -- 06 section 7.1.1 -- class: identity-bearing
--
-- One human account, either a student or a tutor; the MVP has no other kind (glossary, 3.5
-- rule 3). `display_name` is a real name for a tutor and a synthetic demo name for a seeded
-- student, and is never rendered next to an anonymous post (A-ID-3).
-- ---------------------------------------------------------------------------------------------
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null
                  constraint ck_users_email_lower check (email = lower(email))
                  constraint ck_users_email_length check (length(email) <= 320),
  display_name  text not null
                  constraint ck_users_display_name_length check (length(display_name) between 1 and 120),
  -- argon2id. Never selected by a query outside the auth module and never serialised (I-7).
  password_hash text not null,
  role          text not null
                  constraint ck_users_role check (role in ('student','tutor')),
  -- false fails login with UNAUTHENTICATED.
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 06 section 6.6: `uq_users_email` unique (lower(email)). A unique constraint cannot be declared
-- over an expression, so this is the unique index form the spec names (spec schema.md 2.1).
create unique index uq_users_email on users (lower(email));

-- ---------------------------------------------------------------------------------------------
-- courses -- 06 section 7.1.2 -- class: identity-free
--
-- The university subject that groups assignments and enrolments.
-- ---------------------------------------------------------------------------------------------
create table courses (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null
                       constraint ck_courses_code_length check (length(code) <= 32),
  title              text not null
                       constraint ck_courses_title_length check (length(title) <= 200),
  term               text not null
                       constraint ck_courses_term_length check (length(term) <= 40),
  -- Nullable means "not linked", never "unknown" (6.4).
  created_by_user_id uuid
                       constraint fk_courses_users references users (id) on delete restrict,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- DERIVED name: 7.1.2 says "unique" but does not name the object; 6.1's `uq_<table>_<columns>`
  -- convention gives this one.
  constraint uq_courses_code unique (code)
);

-- ---------------------------------------------------------------------------------------------
-- enrollments -- 06 section 7.1.3 -- class: identity-bearing
--
-- The access-control join between a user and a course. Every authorization check in 06 section
-- 5.2 resolves through this table.
--
-- `role_in_course` must equal `users.role` for the same user. 7.1.3 states that this is "checked
-- by the query layer; a trigger is optional", so there is deliberately no trigger here.
-- ---------------------------------------------------------------------------------------------
create table enrollments (
  id             uuid primary key default gen_random_uuid(),
  course_id      uuid not null
                   constraint fk_enrollments_courses references courses (id) on delete restrict,
  user_id        uuid not null
                   constraint fk_enrollments_users references users (id) on delete restrict,
  role_in_course text not null
                   constraint ck_enrollments_role check (role_in_course in ('student','tutor')),
  -- O4: displayed nowhere and grants nothing (3.5 rule 2).
  is_owner       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint uq_enrollments_course_user unique (course_id, user_id)
);

-- 06 section 6.6
create index idx_enrollments_user on enrollments (user_id, role_in_course);
