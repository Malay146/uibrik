'use client';

import * as React from 'react';
import { init } from '@squircle/core';

// Flags <html> once the paint worklet is registered. Until then (or if it never
// loads) globals.css keeps squircle-mask elements on plain rounded corners, since
// an unregistered paint(squircle) mask would hide them.
export function SquircleProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    init().then(
      () => document.documentElement.setAttribute('data-squircle', ''),
      () => {},
    );
  }, []);
  return children;
}
