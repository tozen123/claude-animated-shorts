// Studio entry: registers every short found at src/videos/<name>/composition.ts (default export
// { id, component, durationInFrames }). Nothing project-specific lives here, so this file is safe to commit while the
// project folders themselves stay local (.gitignore: studio/src/videos/). New short: add its composition.ts.
import React from "react";
import { Composition, registerRoot } from "remotion";

type Comp = { id: string; component: React.FC; durationInFrames: number };
declare const require: { context: (dir: string, deep: boolean, re: RegExp) => { keys: () => string[]; (k: string): { default: Comp } } };
const ctx = require.context("./videos", true, /^\.\/[^/]+\/composition\.ts$/);
const comps = ctx.keys().map((k) => ctx(k).default).sort((a, b) => a.id.localeCompare(b.id));

const Root: React.FC = () =>
  React.createElement(React.Fragment, null,
    ...comps.map((c) => React.createElement(Composition, { key: c.id, id: c.id, component: c.component, durationInFrames: c.durationInFrames, fps: 30, width: 1080, height: 1920 })));
registerRoot(Root);
