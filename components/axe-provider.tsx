"use client";

import { useEffect } from "react";

export function AxeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    // require() returns the mutable CJS object; ES module namespace is read-only
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require("react");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactDOM = require("react-dom");
    import("@axe-core/react").then(({ default: axe }) => {
      axe(React, ReactDOM, 1000);
    });
  }, []);

  return <>{children}</>;
}
