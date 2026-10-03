import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '../styles/globals.css';

// The shell only. Phase 1 is a walking skeleton: this route proves the app boots, serves
// HTML, and has loaded its stylesheet. Every real surface arrives with its own phase, and
// nothing here may pre-empt one -- in particular there is no navigation, no assignment
// list, and no placeholder for the Assistant.
export const metadata: Metadata = {
  title: 'Assignment Assistant',
  description:
    'An AI-native assignment workspace. The Assistant never does the assignment for the student.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
