'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * The persistent left sidebar, shared by the student and tutor views.
 *
 * ## What it is, and what it deliberately is not
 *
 * It is **navigation only**: courses, their assignments, and which one you are looking at. It carries
 * no status, no progress and no counts. A sidebar that showed a status would be a second place for the
 * product's visibility rules to be stated, and therefore a second place for them to be wrong -- gate
 * rule G1 lives in the query layer (`06` section 3.4) and the sidebar is not allowed to restate it.
 * The data it renders is a title and an id.
 *
 * ## Why the same component serves both roles
 *
 * `roleInCourse` changes *which* assignments arrive, never how the tree looks, so the two views stay
 * consistent by construction rather than by two components kept in sync. Role-specific content lives
 * in the selected assignment's workspace, which is where the two roles genuinely differ (a student
 * reads the brief; a tutor reviews proposals).
 *
 * ## Active state, and why it reads the URL
 *
 * `usePathname` is the only source of truth for "where am I": deriving it from a prop would mean every
 * layout passing the current route down and keeping it correct. Both route shapes are matched --
 * `/student/courses/{courseId}` and `/student/assignments/{assignmentId}`, and the tutor equivalents.
 *
 * The active assignment is matched on the **assignment id**, not on a string prefix, so a course whose
 * id happens to prefix another cannot highlight the wrong row.
 *
 * ## Expansion state
 *
 * Local state, seeded so the course you are inside is always open, and persisted to `localStorage` so
 * a collapsed tree stays collapsed across navigation. Persistence is per-role: a tutor who collapsed
 * everything while reviewing does not want a student's tree forced open.
 *
 * **The seeded-open rule is applied on every route change, not only on mount.** Without that, a
 * student following a link into a collapsed course would land on a page whose own course is hidden --
 * which reads as a broken sidebar rather than a collapsed one.
 */

export interface SidebarAssignmentItem {
  readonly id: string;
  readonly title: string;
}

export interface SidebarCourseItem {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly term: string;
  readonly roleInCourse: 'student' | 'tutor';
  readonly assignments: readonly SidebarAssignmentItem[];
}

export interface SidebarProps {
  readonly courses: readonly SidebarCourseItem[];
  /** The signed-in user's display name, shown at the foot. */
  readonly displayName: string;
  /**
   * Passed explicitly rather than inferred from `courses[0]`.
   *
   * Inferring it meant an empty course list defaulted to `student` on the server and could resolve
   * differently on the client, so the `localStorage` key the lazy initialiser read was not guaranteed
   * to be the key the toggle wrote -- and a mismatch there is a hydration difference, not a cosmetic
   * one. The layout knows the role; the component asks for it.
   */
  readonly role: 'student' | 'tutor';
}

/** Runs of letters in a course code, so `COSC2407` reads as `CO` and `ISYS-1010` as `IS`. */
function courseInitials(code: string): string {
  const letters = code.replace(/[^A-Za-z]/g, '');
  return (letters.slice(0, 2) || code.slice(0, 2)).toUpperCase();
}

/**
 * The ids of the course and assignment a path points at.
 *
 * Written as one pass over the segments rather than two regexes, so an unexpected route shape yields
 * `null` instead of a partial match.
 */
function parseLocation(pathname: string): { courseId: string | null; assignmentId: string | null } {
  const segments = pathname.split('/').filter((s) => s !== '');
  let courseId: string | null = null;
  let assignmentId: string | null = null;
  for (let i = 0; i < segments.length; i += 1) {
    const next = segments[i + 1];
    if (next === undefined) continue;
    if (segments[i] === 'courses') courseId = next;
    if (segments[i] === 'assignments') assignmentId = next;
  }
  return { courseId, assignmentId };
}

const STORAGE_PREFIX = 'assignmate.sidebar.expanded.';

export function Sidebar({ courses, displayName, role }: SidebarProps): React.ReactElement {
  const pathname = usePathname();
  const { courseId: activeCourseId, assignmentId: activeAssignmentId } = parseLocation(pathname);

  const storageKey = `${STORAGE_PREFIX}${role}`;

  /**
   * The set of courses the user has explicitly collapsed.
   *
   * **Collapse is opt-in, so openness is derived rather than stored.** Every course is open unless its
   * id is in this map, which means an unknown course, a first visit and a cleared store all default to
   * the useful state without anything having to write a default. Storing `true` for "open" instead
   * would need a seeding pass for every new course, and that pass is exactly the effect this design
   * removes.
   *
   * Inverted like this, the active-course rule needs no effect either: the course you are inside
   * renders open *even if it is in the collapsed set*, so navigating into a collapsed course shows its
   * own page in the tree. The stored preference is honoured the moment you leave.
   */
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => {
    // A lazy initialiser, not an effect: reading `localStorage` during the client's first render keeps
    // the server and the client agreeing on the first paint, because the server has no store and
    // therefore renders the same all-open tree the client starts from. Reading it in an effect would
    // render open, then collapse -- a visible jump, and the cascading render the lint rule warns about.
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) return new Set<string>();
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return new Set<string>();
      return new Set(parsed.filter((id): id is string => typeof id === 'string'));
    } catch {
      // A corrupt or unavailable store is not worth surfacing: the tree still works and simply
      // forgets the preference. Private-mode `localStorage` throws on read in some browsers.
      return new Set<string>();
    }
  });

  const toggle = useCallback(
    (id: string) => {
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // As above: the preference is a convenience, not state the product depends on.
        }
        return next;
      });
    },
    [storageKey],
  );

  return (
    <nav
      aria-label="Courses and assignments"
      className="flex h-full w-64 shrink-0 flex-col border-r border-solid border-default bg-card"
    >
      <div className="flex items-center gap-2 border-b border-solid border-default px-4 py-3">
        <span className="heading-3 text-ink">AssignMate</span>
      </div>

      <p className="ui-sm px-4 pt-4 pb-2 text-muted">Courses</p>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {courses.length === 0 ? (
          <p className="ui-sm px-2 py-2 text-muted">No courses yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {courses.map((course) => {
              const isActiveCourse = course.id === activeCourseId;
              // Open by default; explicitly collapsed only if the user said so; and always open for
              // the course currently being viewed.
              const isOpen = !collapsed.has(course.id) || isActiveCourse;
              const panelId = `sidebar-course-${course.id}`;
              return (
                <li key={course.id}>
                  <div
                    className={cn(
                      'flex items-stretch rounded-control',
                      isActiveCourse && activeAssignmentId === null ? 'bg-page' : null,
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        toggle(course.id);
                      }}
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${course.code}`}
                      className="flex w-6 shrink-0 items-start justify-center rounded-control pt-2 text-muted transition-colors duration-fast ease-out hover:text-ink"
                    >
                      {/* Two glyphs rather than one rotated node. The design law forbids `transition`
                          in the primitives, and a chevron that snaps is honest about a state change
                          that is itself instant -- there is nothing moving continuously to ease. */}
                      <span aria-hidden="true">{isOpen ? '\u25BE' : '\u25B8'}</span>
                    </button>

                    <Link
                      href={`/${role}/courses/${course.id}`}
                      className={cn(
                        'flex min-w-0 flex-1 items-start gap-2 rounded-control px-1 py-2 tight text-ink transition-colors duration-fast ease-out',
                        isActiveCourse && activeAssignmentId === null ? null : 'hover:bg-page',
                      )}
                    >
                      {/* The icon is initials, not an image: a course code is already an identifier a
                          student recognises, and it needs no new asset or colour to be meaningful. It
                          aligns to the first line rather than to the centre, because a wrapping title
                          would otherwise push it down and break the row's reading order. */}
                      <span
                        aria-hidden="true"
                        className="mono-sm mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-control border border-solid border-default text-muted"
                      >
                        {courseInitials(course.code)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block">{course.code}</span>
                        {/* Long titles wrap instead of being cut. Truncation is forbidden by the
                            design law (`17` S2.4 rule 7) so a name is never half-shown, and a course
                            title is a document fact a reader may need in full (C2). */}
                        <span className="ui-sm block text-muted">{course.title}</span>
                      </span>
                    </Link>
                  </div>

                  {isOpen ? (
                    <ul id={panelId} className="mt-1 flex flex-col gap-1">
                      {course.assignments.length === 0 ? (
                        <li className="ui-sm py-1 pl-9 text-muted">No assignments yet.</li>
                      ) : (
                        course.assignments.map((assignment) => {
                          const isActive = assignment.id === activeAssignmentId;
                          return (
                            <li key={assignment.id}>
                              <Link
                                href={`/${role}/assignments/${assignment.id}`}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                  // Indented under its course, and the `pl-9` matches the course
                                  // icon's column so the two levels line up rather than merely being
                                  // offset. Assignment titles wrap for the same reason course titles
                                  // do -- a half-shown assignment name is worse than a taller row.
                                  'block rounded-control py-2 pr-2 pl-9 tight transition-colors duration-fast ease-out',
                                  isActive
                                    ? 'bg-page text-ink'
                                    : 'text-muted hover:bg-page hover:text-ink',
                                )}
                              >
                                {assignment.title}
                              </Link>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-solid border-default px-4 py-3">
        <p className="ui-sm text-muted">{displayName}</p>
      </div>
    </nav>
  );
}
