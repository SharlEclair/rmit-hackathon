-- 0009_views.sql
--
-- The two views (06 section 7.7; spec schema.md section 3). Both are read-only and both are
-- load-bearing for an invariant.
--
-- No destructive statement appears in this file.

-- ---------------------------------------------------------------------------------------------
-- discussion_author_display -- 06 section 7.7 -- A-ID-3
--
-- The only author-label surface a tutor-facing query may read. It exposes `display_label` and
-- nothing else about the author: it never selects `student_id`, and for an anonymous post the
-- `users` join cannot match because `author_user_id` is null by `ck_posts_author_xor` (7.5.2).
--
-- A tutor-facing handler that needs an author label must read this view. A tutor-facing handler
-- that reads `anon_identities` directly is a defect with a test attached (test T-03).
--
-- Querying a view is ordinary SELECT, which is not an UPDATE, so this view cannot trip the
-- `set_updated_at()` trigger on discussion_posts (0010).
-- ---------------------------------------------------------------------------------------------
create view discussion_author_display as
select dp.id                as post_id,
       dp.thread_id         as thread_id,
       dp.is_anonymised     as is_anonymised,
       case when dp.is_anonymised
            then 'Anonymous Student #' || ai.display_number::text
            else u.display_name
       end                  as display_label
from discussion_posts dp
left join anon_identities ai on ai.id = dp.author_anon_identity_id
left join users u           on u.id  = dp.author_user_id;

-- ---------------------------------------------------------------------------------------------
-- v_rubric_milestone_edges -- 06 section 7.7
--
-- Derived Assignment Map edges: rubric section -> milestone through a shared requirement. Not
-- stored, because every Map edge must be anchored on a requirement (D14, D19).
-- ---------------------------------------------------------------------------------------------
create view v_rubric_milestone_edges as
select rrl.assignment_id      as assignment_id,
       rrl.rubric_section_id  as rubric_section_id,
       mrl.milestone_id       as milestone_id
from requirement_rubric_links rrl
join milestone_requirement_links mrl
  on mrl.requirement_node_id = rrl.requirement_node_id;
