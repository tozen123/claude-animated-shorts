// Word-timed subtitles in the reference shorts' style (measured from audio-sample/, 1080x1920 frames):
//  - 1-3 words at a time (<= ~14 characters), split after . , ? ! and before a long word; numbers stay digits.
//  - Text exactly as spoken (lowercase stays lowercase, punctuation kept: "every 39", "feet.", "a snake,").
//  - White, heavy rounded sans (Montserrat 800), ~78 px at 1080 wide, thick black outline (~7 px) + soft drop
//    shadow, centred horizontally, baseline-centre at ~70 % of the frame height (just under the subject's chest).
//  - Hard cuts: a caption appears on its first word's start (2 frames early, like the picture's reactions) and stays
//    until the next caption, or 0.35 s after its last word before a pause. No pop, fade or karaoke highlight.
// Usage (inside the composition, on top of the picture):
//   import WORDS from "./words.json";  <Captions words={WORDS} />
// All sizes are given at 1080 wide and scale with the output (works for stills at 0.5 and the 1440 final).
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Montserrat";

const { fontFamily } = loadFont("normal", { weights: ["800"], subsets: ["latin"] });

export type Word = { w: string; s: number; e: number };
export type Caption = { text: string; s: number; e: number };

/** group words into 1-3 word captions the way the reference does */
export const groupWords = (words: Word[], maxWords = 3, maxChars = 14, hold = 0.35): Caption[] => {
  const out: Caption[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ text: cur.map((w) => w.w).join(" "), s: cur[0].s, e: cur[cur.length - 1].e });
    cur = [];
  };
  for (const w of words) {
    const text = [...cur, w].map((x) => x.w).join(" ");
    if (cur.length && (cur.length >= maxWords || text.length > maxChars)) flush();
    cur.push(w);
    if (/[.,!?;:]["'”’)]*$/.test(w.w)) flush(); // a caption ends on punctuation
  }
  flush();
  // each caption holds until the next one starts, unless there is a real pause
  for (let i = 0; i < out.length; i++) {
    const next = out[i + 1];
    out[i].e = next && next.s - out[i].e < hold + 0.15 ? next.s : out[i].e + hold;
  }
  return out;
};

export const Captions: React.FC<{ words: Word[]; lead?: number; y?: number; size?: number }> = ({ words, lead = 2, y = 0.7, size = 78 }) => {
  const f = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const caps = React.useMemo(() => groupWords(words), [words]);
  const t = (f + lead) / fps;
  const c = caps.find((x) => t >= x.s && t < x.e);
  if (!c) return null;
  const k = width / 1080, px = size * k, stroke = 7 * k;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{
        position: "absolute", left: 0, right: 0, top: `${y * 100}%`, transform: "translateY(-50%)", textAlign: "center",
        fontFamily, fontWeight: 800, fontSize: px, lineHeight: 1.05, color: "#ffffff", letterSpacing: -0.5 * k,
        WebkitTextStroke: `${2 * stroke}px #000000`, paintOrder: "stroke fill",
        textShadow: `0 ${4 * k}px ${6 * k}px rgba(0,0,0,0.55)`, padding: `0 ${60 * k}px`,
      }}>
        {c.text}
      </div>
    </AbsoluteFill>
  );
};
