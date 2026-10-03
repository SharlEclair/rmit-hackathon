import type { ReactElement } from 'react';

import { ContentClassPanel, type ContentClassPanelProps } from './content-class-panel';

/**
 * `ContentClassPanelProps` with its `contentClass` discriminant renamed to `tone`, so the
 * two components cannot drift: adding a class to the panel adds it here for free.
 */
type WithTone<T> = T extends { contentClass: infer C } ? Omit<T, 'contentClass'> & { tone: C } : never;

export type ThemeScopeProps = WithTone<ContentClassPanelProps>;

/**
 * The only way a page obtains a content-class frame (`17` S7.6 rule 1).
 *
 * Nothing outside this directory may set a content-class surface, border or left rule: a page
 * that needs the T2 treatment renders `<ThemeScope tone="approved">` rather than repeating the
 * class strings, so the five treatments have exactly one definition.
 */
export function ThemeScope(props: ThemeScopeProps): ReactElement {
  switch (props.tone) {
    case 'official':
      return (
        <ContentClassPanel
          contentClass="official"
          officialKind={props.officialKind}
          sourceFile={props.sourceFile}
          sourcePage={props.sourcePage}
          title={props.title}
          headerAside={props.headerAside}
          stickyBadge={props.stickyBadge}
          className={props.className}
        >
          {props.children}
        </ContentClassPanel>
      );
    case 'approved':
      return (
        <ContentClassPanel
          contentClass="approved"
          publishedOn={props.publishedOn}
          title={props.title}
          headerAside={props.headerAside}
          stickyBadge={props.stickyBadge}
          className={props.className}
        >
          {props.children}
        </ContentClassPanel>
      );
    case 'structure':
      return (
        <ContentClassPanel
          contentClass="structure"
          title={props.title}
          headerAside={props.headerAside}
          stickyBadge={props.stickyBadge}
          className={props.className}
        >
          {props.children}
        </ContentClassPanel>
      );
    case 'peer':
      return (
        <ContentClassPanel
          contentClass="peer"
          title={props.title}
          headerAside={props.headerAside}
          stickyBadge={props.stickyBadge}
          className={props.className}
        >
          {props.children}
        </ContentClassPanel>
      );
    case 'interpretation':
      return (
        <ContentClassPanel
          contentClass="interpretation"
          approvalState={props.approvalState}
          title={props.title}
          headerAside={props.headerAside}
          stickyBadge={props.stickyBadge}
          className={props.className}
        >
          {props.children}
        </ContentClassPanel>
      );
  }
}
