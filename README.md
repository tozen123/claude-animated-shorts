# Claude Animated Shorts

The free Claude skill from the video **"How to Make Viral Animated Shorts Using Claude (Full Workflow)"**.

It makes 55-70 s vertical animated story shorts: 2D characters in a colourful 3D world, with ink outlines, a painted town, lens blur, gliding cameras, a march score and sound effects. Everything is rendered with three.js inside Remotion on your own PC, with no AI video generator.

Proven on **The Bridge That Fell for a Song**, a 67 s short about the 1831 Broughton bridge.

## What's inside
| Path | What it is |
|---|---|
| `SKILL.md` | The skill: the full pipeline, every rule, every fix, and the final look values |
| `templates/bridge/` | The full source of the bridge short: world, characters, ink, lens blur, grade, story/camera |
| `templates/voice/make_voice.py` | Narration + word timings from ElevenLabs (`--voice "David"`, model `eleven_v3`); key goes in the root `.env` (see `.env.example`) |
| `templates/captions/Captions.tsx` | Word-timed subtitles in the reference style (1-3 words, white Montserrat 800, black outline, 70 % height) |
| `templates/motion/bounce.ts` | Springy motion for main subjects: pop-in, drop-in, hop with squash and stretch, punch, breathing, car springs |
| `templates/fx/glow.ts` | Reference 3D look: glossy / chrome / brass materials, HDR emissives, lamp halos, god rays, sun haze, thin world ink, bloom preset |
| `templates/fx/particles.ts` | Deterministic particles: sparks, embers, impact dust + debris, anger bolts, glowing eyes, rain, lightning, sparkles, sweat, shock lines |
| `templates/fx/reactions.ts` | Expression-change reactions: face switch + body squash/hop + matching effect (glowing furious eyes, bolts, sweat, sparkles, shock lines) |
| `templates/fx/dressing.ts` | Scene dressing and ambient life: grass tufts, flowers, gravel, rocks, bushes, fences, telegraph poles, props, furnished rooms (wainscot, pictures, bookcases, rugs, plants, clocks, curtains, desk clutter), birds, leaves, smoke, dust motes |
| `templates/fx/architecture.ts` | Building kit: detailed houses and shops (plinth, siding, cased windows, panelled doors, thick roofs, false fronts with pictogram signs, porches, balconies, chimneys), street objects (barrels, crates, wagon, trough, hitching rail, water tower, lamp post, well), burnt ruins and faceted buttes |
| `templates/fx/frame.ts` | Subject-aware camera: auto-framing keeps main subjects inside the 9:16 safe area; autofocus on the main subject with a blur cap so subjects are never blurred |
| `templates/fx/volumetric.ts` | Volumetric light: screen-space god rays from the sun (occluded by roofs and trees), soft drifting light-shaft volumes, sunbeams aimed per shot, lamp cones |
| `templates/fx/ambient.ts` | Living backgrounds: wind in grass, bushes and trees (outlines follow it), hand-held camera float, swaying hung lanterns and signs, breathing lights, drifting clouds, background people walking loops |
| `templates/fx/camera.ts` | Springy camera paths (soft start, small overshoot and settle) and a separate shake layer (damped kicks, smooth rumbles) that never disturbs the framing |
| `templates/fx/transitions.ts` | Seamless shot transitions: whip pans with directional motion blur, push-throughs, match dissolves, flashes, with the matching camera motion on both sides of the cut |
| `templates/fx/depthlight.ts` | Depth lighting post pass: aerial perspective, ground mist, distance desaturation, warm sun scatter, depth contact shading and light rims |
| `projects/<name>/` | One folder per short: `SCRIPT.md`, `voice/`, `audio/` |
| `studio/` | The Remotion project the shorts render in (`src/videos/<name>/`); `npm install` once |
| `templates/audio/` | The synthesized sound: SFX, march music, the mix with ducking and loudness |
| `templates/scripts/` | Stills, side-by-side sheets, shot merge and frame-by-frame QA helpers |
| `references/STYLE_BIBLE.md` | The script and visual formula measured from 20 reference shorts |
| `references/reports/` | Seven measured reports: motion, depth, textures, characters, lighting, outlines, grade |
| `references/frames/` | 38 full-size reference frames (540x960) to compare your frames against |
| `references/sheets/` | 20 contact sheets, one per reference short, 60 frames each (1,200 frames) |

## Install
1. Copy this folder to `~/.claude/skills/cartoon-3d-short/` (clone it there, or download the ZIP).
2. You need [Remotion](https://www.remotion.dev/) with `@remotion/three`, plus Node, Python 3 and ffmpeg. For the voice, an [ElevenLabs](https://elevenlabs.io/) API key pasted into `.env` at the repo root.
3. In Claude Code, say: *"Use the cartoon short skill and make a short about …"*.

Claude then follows `SKILL.md`: topic and facts, then script, then voice, then the shot plan in `story.ts`, then stills, then renders. Agents check your frames against the reports and the frames, and you get the final 2K render and sound mix.

## Notes
- Set `REMOTION_TMP` to a folder on a big drive. Every Remotion bundle copies `public/` (~1.3 GB) into the temp folder.
- Story, characters and voice should always be your own. Use the references for the look, not the content.

## License
The code and docs are MIT (see `LICENSE`). The reference frames are included for style study only.
