'use client';

import * as React from 'react';
import { init } from '@squircle/core';

// Flags <html> once the paint worklet is registered. Until then (or if it never
// loads) globals.css keeps squircle-mask elements on plain rounded corners, since
// an unregistered paint(squircle) mask would hide them.
//
// disablePolyfill: browsers without the CSS Paint API (Safari) would otherwise
// load @squircle/paint-polyfill, which re-runs on every style mutation in the
// document. Every Motion animation writes styles each frame, so in Safari each
// frame cost about 90 ms (measured on Meeting Planner's zone change). There the
// worklet simply fails to register and squircles fall back to rounded corners.
export function SquircleProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    init({ disablePolyfill: true }).then(
      () => document.documentElement.setAttribute('data-squircle', ''),
      () => {},
    );
  }, []);
  return children;
}
