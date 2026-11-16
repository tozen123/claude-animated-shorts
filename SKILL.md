---
name: cartoon-3d-short
description: Make a ~55-70 s vertical cartoon story short in the "2D characters in a colourful 3D world" style (flat bean-head cartoon cards with ink outlines, painted 3D town/world with black ink lines, saturated sky, depth-of-field backgrounds, gliding cameras, voice narration, synthesized SFX + march-style music), rendered with three.js inside Remotion. Proven on "The Bridge That Fell for a Song" (2026-10-31). Use when the user asks for another video "like the bridge video", "like the soldiers/bridge short", "in that cartoon 3D style", a history/science story short with cartoon characters in 3D, or says "use the cartoon short skill".
---

# Cartoon 3D story short (three.js + Remotion)

Proven example: **The Bridge That Fell for a Song**. It is an original 67 s short about the 1831 Broughton bridge and 74 soldiers marching in step.
- Code: `src/videos/bridge/` of your Remotion project (composition `BridgeShort`, 1080x1920, 30 fps).
- Script, voice and sound: `~/bridge-short/`.
- Style research: `references/`.

The style reference is a channel studied privately (`references/`: STYLE_BIBLE.md, reports/*.md, frames/).
- Those videos are private study material. Never upload, publish or send them.
- Never copy their scripts, characters or shots. Story, characters and voice are always OUR OWN.
- Never say the channel's name in a voice-over or description.

User rules that apply:
- Word-timed subtitles in every video, in the reference style (see **Subtitles** below). No other text in the picture: signs, boards and labels in the 3D world use pictograms only.
- Main subjects (characters, vehicles, story props, effect cards) move with bouncy, springy, smooth animation; background scenery never bounces (see **Bouncy motion** below).
- English only.
- Voice: one steady tone.
- Jokes are researched real facts.
- Standard mix: music +3 dB, SFX -6 dB, voice unchanged.
- Final export 2K vertical: 1440x2560, `--scale 1.3333333333333333` (exactly 4/3: Remotion 4 rejects `1.3333`, which gives a 2559.94 px height).
- Opus max verifies every check.
- Save after every step.
- "Just do it" once the script is approved.

## Pipeline
1. **Topic and facts.** Pick one surprising true story with a physical cause and effect (it should be visual), plus a simple everyday analogy that explains it.
   - Write the facts with their source at the top of `SCRIPT.md`.
2. **Script** (~3.7 words/s, 55-70 s). Beat formula from the bridge short:
   - **Hook:** the absurd fact in one line ("Seventy-four soldiers knocked down an iron bridge just by walking across it.").
   - **Setting:** year, place, pride.
   - **Action:** escalation over three or four beats, each a little bigger.
   - **Snap:** the moment it breaks.
   - **Deadpan double line:** "Luckily ... / Unluckily ...".
   - **Explanation:** one physics idea through an everyday analogy (the kid on a swing).
   - **Consequence:** the rule it created.
   - **Callback twist:** the ending.
   - Never describe on screen what the viewer already sees.
3. **Voice.** Make `voice.wav` and its word timings `words.json` with `templates/voice/make_voice.py` (ElevenLabs).
   - `python templates/voice/make_voice.py <project> --voice "David" --takes 3`, listen, then `--use N`. It reads the
     script table in `<project>/SCRIPT.md` and writes `<project>/voice/voice.wav` (48 kHz) + `words.json`
     (`[{"w","s","e"}]`, from ElevenLabs character timestamps; faster-whisper fallback).
   - Needs `ELEVENLABS_API_KEY` in the `.env` at the repo root (git-ignored; `.env.example` shows the format).
     The user pastes the key; never type, print or commit it.
   - Layout: each short is `projects/<name>/` (SCRIPT.md, voice/, audio/); the Remotion project is `studio/`
     (`studio/src/videos/<name>/`, run `npm install` in `studio/` once).
   - Target pace 3.4-3.8 words/s with almost no pauses; ~220-235 words for 60 s. Proven recipe (road short):
     `--model eleven_multilingual_v2 --tight --speed 1.15 --style 0.45 --stability 0.35`, then `--tighten` (cuts
     silent gaps to 0.24 s after sentences / 0.14 s after commas and shifts words.json). `eleven_v3` is the most
     expressive and takes audio tags (`[excited]`, `[whispers]`), but it ignores `--speed` and reads ~2.4 words/s.
   - Free ElevenLabs plans can use only premade voices through the API (Voice Library voices return HTTP 402):
     generate library voices on elevenlabs.io and bring the file in with `--from-file <audio>`.
   - A recorded voice works too: drop in `voice.wav` and make `words.json` with any speech-to-text with word times.
   - Hand-fix the word timings. Everything is timed to words.json.
4. **Shot plan** in `story.ts`: copy `templates/bridge/` (the final bridge source, same as `src/videos/bridge/` of your Remotion project) to `src/videos/<name>/`, register a new composition next to `BridgeShort` in `src/Root.tsx`, and rename it.
   - `SHOTS`: id, a/b frames, light day/golden, crowd mode, `tau` story time.
   - `XFADE`: crossfades at place/time changes.
   - `FLASH_AT`: a white flash after the hook.
   - `CAMS`: per-shot keys `{f, dur?, cut?, s: f => {pos, look, fov, roll}}`.
   - `KICKS`: impact flip-shakes.
   - `DOF`/`dofAt`: lens blur per beat.
   - `FOREGROUND`: near framing props.
   - Every visual reaction lands 0-3 frames before its word.
5. **World.**
   - `lights.ts`: LIGHTS plus the LOOK sky/river/cloud palette per light.
   - `shade.ts`: two-tone shading and `untone()`.
   - `build.ts`: town, houses and Kenney CC0 kit props, recoloured, with sight-line culling of anything blocking a camera.
   - `paint.ts`: HD Canvas2D painted textures with seams painted in as dark tints.
   - `world.ts`: sky shader, fog = horizon colour, river, per-frame posing, sun frozen per shot and camera-relative.
6. **Characters.**
   - `toon.ts`: the Canvas2D `Pen` drawing API, 600x1000 design canvas, soles at y = 975, bean heads, stick limbs, plum variable-width outline, face library.
   - `cast.ts`: camera-facing billboards, crowds, effect cards, blinks, walk cycles. All billboards go on the `NOINK` layer.
   - `cardshade.ts`: cards lit by the scene light, no emissive.
   - `bounce.ts` (copy from `templates/motion/`): springy motion for every main subject, see **Bouncy motion**.
     Places carry `sx, sy, dy` (squash about the feet + hop height); vehicles carry `heave, bodyPitch, dy, sx, sy`.
7. **Post** (`Bridge.tsx` + `ink.ts` + `lensblur.ts` + `grade.ts`).
   - Composer order: ink → lens pre → lens main → bloom → NEUTRAL tone map → grade (MSAA 4).
   - Every pixel parameter scales with output height / 1920.
   - Reference look: `new InkPass(scene, camera, SAMPLE_INK)` and the bloom from `SAMPLE_BLOOM` (`templates/fx/glow.ts`),
     plus glossy materials, lamps, light shafts and `SunGlare` in world.ts; reactions and particles in cast.ts (see the
     **3D look** and **Particles** sections below). The dog short (`studio/src/videos/dog/`) is the worked example.
   - Subtitles: copy `templates/captions/Captions.tsx` next to the composition and mount `<Captions words={WORDS} />`
     as the LAST layer (above the flash). Needs `npm install @remotion/google-fonts@<remotion version>` in `studio/`.
     Input prop `{ captions: false }` hides them for look-check stills.
8. **Sound** (`~/bridge-short/audio/`: timeline.py, sfx_gen.py, sfx.py, music.py, instruments.py, dsp.py, mix.py).
   - Event table → synthesized SFX plus an original score ducked under the voice.
   - Output: mix.wav (48 kHz, exact length), stems and cues.md.
   - Lock the picture's time constants before the sound is made. Any later timing change means re-running the sound.
9. **Look checks.** Run `node scripts/bridge-stills.mjs out/<name>/x_ 100,400 0.5`.
   - Set `BRIDGE_ENTRY=src/sandboxes/<n>/index.tsx` to render a sandbox copy.
   - Make side-by-sides against reference frames with `python scripts/sbs_sheet.py out.jpg --ours ... --ref ...`.
   - Send them to an Opus max verifier: 1-3 images, a ≤200-word verdict.
10. **Final render.**
    - `npx remotion render src/index.ts <Comp> out/<name>/video.mp4 --codec h264 --crf 16 --scale 1.3333333333333333 --gl angle`
    - Mux with `-map 0:v:0 -map 1:a:0` (Remotion writes a silent audio track).
    - QA: `python scripts/short_qa.py final.mp4 out/<name>/qa shots.json` checks every frame for black, white, frozen and pop frames, plus loudness and sheets.
    - Fix anything it finds, then run a deep Opus audit.
11. **Deliver.** SendUserFile the final mp4, update memory, write notes.

## Final look values (bridge after 4 verifier rounds; all in `templates/bridge/`)
Start every new short from `templates/bridge/` (copy to `src/videos/<name>/`): the look lives in these values, the
story lives in story.ts / build.ts layout / cast.ts roles. Opus max scores at the end: colour day 7, golden 5-6,
lighting 5-6, ink 6, textures 5-6, characters 7, depth 6-7, composition 6-7 (from 5/3/4/5/4/7/4/6 at the start).
- **Light presets** (`lights.ts`, sun camera-relative and frozen per shot):
  - day: az 75 / el 48, lit [1.58,1.5,1.33], shade [.30,.29,.36], lift [.05,.06,.11] (cool tint ONLY in shade), sky
    top #3e7fd2 → horizon #b8d0ec, fog = horizon, 25→300 m, uSat 1.08, ~15 % blue haze past 60 m.
  - golden: az 6 / el 7 (backlit low sun), key toward #FFB36B ×1.5, violet-blue shade (facade ≈ #444380), sky
    #ffc47c → #8a6f8a, peach fog only past 50 m, sun disc #ffcf9e + bloom, contact blobs + real card shadows.
- **Albedos** (`paint.ts`/`build.ts`): muted brick / cream / ochre / terracotta houses with plinth, cornice, sills,
  hoods, door step, chimney + pot, heights 7 / 8.4 / 9.8 m; warm grey/beige stone (saturation −35 % from "storybook");
  ochre wood deck C* ~51-58 with near-black seams; iron dark and desaturated. Never lemon, never lavender lit faces.
- **Ink** (`ink.ts`): #030303, 5.1 px near (6 m) → 3.3 px far (90 m) at 1080x1920, creases ×0.8 from 35°, depth
  jumps from 1 %, fog tint 0.3 only far; character cards on layer `NOINK` (they carry their own plum ink).
- **Lens** (`lensblur.ts` + `dofAt` in story.ts): cInf px at 1080: hook/river CU 15-16, close-ups 12-14, MS 10-12,
  park 7, golden sway 5, wides/aerials 0. Focus on the eyes of the front row.
- **Post** (`Bridge.tsx`): ink → lens pre → lens main → bloom (thr 1.0, int .5, 6 levels, radius .6) → NEUTRAL tone
  map → grade; MSAA 4. Film grain exists but is OFF (reference measures no grain; it quadruples the file size).
- **Characters** (`toon.ts`/`cast.ts`/`cardshade.ts`): bean heads h/w .94, plum ink #241726, eyes .26 W apart, no blush,
  14 expressions; adults 3.5 head-heights; walk bob 5 %, lean 1-7°, planted 0.8 m stride; blinks 0.5-2.3 s; tight
  contact shadow ~.5 under the feet + sun-direction tail by day; golden rim inner only (never an offset outer copy).
- **Camera** (`story.ts`): cuts on big jumps, smootherstep glides 18-40 f, every hold creeps (no static hold ≥4 f),
  flip kicks decaying over 7 f on impacts, 4-4.6° rolls, foreground props (`FOREGROUND`) in ~1/3 of shots.

## Look targets (measured from the reference; see references/reports/)
- **Ink:**
  - World lines: about 3 px at 1080 wide, near-black #0b0a0c, nearly constant with distance. Silhouettes, depth jumps and normal creases only. No line on wall/floor joins or the horizon. Character cards are never outlined by the world ink.
  - Character ink: dark plum #201628-#2f1d28, thicker on the bottom/shadow side.
- **Colour:**
  - Day median luma ~.57. Non-ink p5 ~.23 (no crushed blacks). Lit chroma C* p90 ~55. Day sky top ~#5e93d9, horizon 1.28x brighter.
  - Golden: peach horizon #ffd08a, violet-blue shadows (never brown), backlit sun.
- **Depth:**
  - DOF on about 1/3 of screen time (CU, MS, inserts), cInf 10-16 px at 1080, focus on the eyes. Establishing and wide shots stay sharp.
  - Fog = horizon colour, 25→420 m day, 20→360 m golden.
  - Bloom only on HDR emissives: threshold 1.0.
- **Camera:**
  - Hard cuts on big jumps. Everything else is a smootherstep glide of 18-40 f, peak ≤ 25 px/f at 720p.
  - Every hold pushes in 0.15-0.35 %/f, with 0.6 %/f on punch words.
  - Rolls of 4-5°.
  - No hand-held float. Impact shakes flip sign every frame and decay over 7 f.
- **Characters:**
  - About 3.5 head-heights tall, legs 1.4 HH.
  - Stick limbs about 0.055 of head width, ink-dot hands.
  - Bean head (h/w ~0.93, narrower chin, pointier crown).
  - No blush or eye highlights. Faces at brightness ~.93.
  - Walk bob 3-7 %, lean 1-7°, planted feet.
  - Blinks every 0.5-2.3 s, lasting 4 f.

## Subtitles (measured from the reference shorts in `audio-sample/`)
Every video gets word-timed subtitles. `templates/captions/Captions.tsx` does all of this from words.json:
- **Grouping:** 1-3 words per caption, at most ~14 characters ("every 39", "feet.", "a snake,"). A caption ends on
  `. , ? !` and before a word that would overflow. Never split a name or a fixed pair if it can be avoided.
- **Text:** exactly as spoken and as written in the script. Keep case and punctuation, numbers as digits. No emoji,
  no keyword colouring, no all-caps.
- **Look:** white Montserrat 800 (heavy rounded sans) at ~78 px for a 1080-wide frame, thick black outline (~7 px)
  drawn under the fill, soft drop shadow (0 4 px 6 px, 55 % black). Centred horizontally, block centred at **70 %**
  of the frame height (about the subject's chest; never over a face). Sizes scale with the output width.
- **Timing:** hard cuts. A caption appears on its first word's start (2 frames early, like the picture's reactions) and
  stays until the next caption, or 0.35 s past its last word before a real pause. No pop, fade, bounce or
  karaoke highlight on the text itself (the reference has none).
- **Checks:** captions never collide with a face or a key prop at the 70 % line (move the subject or the camera,
  not the captions). They survive crossfades and the white flash (mounted last). After a voice re-take, re-copy
  words.json and the captions follow automatically.

## Bouncy motion (main subjects only; measured from `audio-sample/`)
The reference feels springy: a sign drops in and settles with a small bounce; a sheriff hops out of his car, lands
with a squash and stomps (squash) on "furious"; a train rocks and settles on its springs; nothing in the background
ever moves. Use `templates/motion/bounce.ts` (pure functions of time since the event, so any frame renders alone):
- **Who bounces:** the main subjects of the shot: characters, vehicles, story props (wrecks, signs being put up,
  the map pin), effect cards (thought bubbles, stars, the brain). **Who never bounces:** background scenery: trees,
  houses, mesas, poles, ground props and anything nobody is looking at. A prop is a subject only while the story is
  about it (Bernie's signs pop up in the shot where he puts them up, then they stay rigid).
- **Appear:** `popIn` (scale 0 → ~1.14 → 1, settled by ~0.4 s; spring 3 Hz, damping 0.42) with `popSquash`, or
  `dropIn` from 2-3 m (falls stretched, lands squashed, 1-2 smaller hops, restitution ~0.3). Never a linear fade-in.
- **Characters:** `breathe` always on standing cards (1.5 % at 0.45 Hz, phase per character). `hop` for cheers,
  surprises and landings: 0.12 s anticipation dip (sy 0.9), stretched take-off (sy ~1.1), round at the apex,
  landing squash (sy ~0.85, sx ~1.12), then a damped wobble (3.6 Hz, damping 0.36). `punch` (squash then spring
  back, 4.5 Hz) on a reaction word: shock, stomp, laugh, the cut. Squash about the feet, volume preserved.
- **Vehicles:** the body rides its springs with `carBody`: idle rumble (~7 mm), heave + nose-dip on every impact
  (leaving the road, a crash) and a rock back (2-2.4 Hz, damping ~0.3). Wheels stay on the ground. Add `stepBob`
  while ploughing sand or rough ground, `punch`/`impactSquash` on a crash. Drivers ride the same heave.
- **Feel:** everything settles within ~0.3-0.6 s. Big beats get 2-3 visible overshoots, small ones one. Bounce
  amplitude scales with the story beat (a crash > a wave). Reactions still land 0-3 frames before their word.
- **Check:** render 8 consecutive stills every 3-4 frames around each bouncy beat and confirm the arc, the landing
  squash and the settle. Background objects must be identical frame to frame.

## 3D look, highlights and glows (measured from `audio-sample/`; overrides the older ink target above)
Copy `templates/fx/glow.ts` next to world.ts. The reference reads as soft, glossy, lit 3D with cartoon characters on top:
- **Outlines:** the world carries only thin, soft lines (`SAMPLE_INK`: ~2.6 px near → 1.4 px far, 70 % opacity, fading
  out by ~260 m); characters keep their thick plum ink. Pass `SAMPLE_INK` to `new InkPass(scene, camera, SAMPLE_INK)`.
- **Gloss:** painted metal, car paint, varnished wood, brass and chrome get sharp specular glints where the sun hits
  (`glossy(color, shininess, spec)`, `chrome()`, `brass()`; they stay two-tone and shadow-masked). Matte stays Lambert.
- **Glows:** everything that emits light is HDR (`emissive(color, 3-5)`) so it blooms: lamp bulbs + `halo` sprites
  (`lamp()`), lit windows, headlights, light bars, sparks, glowing eyes. Bloom uses `SAMPLE_BLOOM` (intensity 0.85,
  threshold 1.0, 7 levels, radius 0.72): surfaces never bloom, light sources always do. Keep halos small (0.6-1.0 m)
  where they sit in front of a window or face.
- **Light shafts:** a soft additive `lightShaft()` from every interior window to the floor (strength ~0.1; stronger
  washes the window out). **Sun haze:** `SunGlare` placed every frame (day 34°, golden 26° and warmer); it shows when the
  camera faces the sun, like the reference's bright sky corners. Night scenes: warm lit windows + lamp halos against
  blue moonlight.
- **Check:** in stills, highlights sit on curved/glossy things only, glows bloom without hiding faces, windows are not
  white-washed, and world lines are clearly lighter than the characters' ink.

## Particles, lightning and expression reactions (measured from `audio-sample/`)
Copy `templates/fx/particles.ts` and `templates/fx/reactions.ts` next to toon.ts / bounce.ts. Effect cards with `glow`
render additively in HDR (cast.ts `Fx.use(soft, glow, tint)`) and bloom; plain cards are ink-outlined cartoon shapes.
- **Every expression change is an event.** Give each speaking character an expression timeline `[{t, expr}]` (0-3 frames
  before the word) and stage them through `reaction()`: the face switches on the frame, the body answers (`punch`
  squash; a hop for shock and joy) and the matching effect appears:
  - `furious`: within 1 frame red angry eyes that **glow** (HDR, pulsing), the top of the face darkens, a short red flash,
    the body jolts, then red jagged **anger bolts** crackle around him, re-drawn every 2-3 frames while the anger lasts
    (the reference sheriff);
  - `shock`: a hop plus three **shock lines** over the head; `nervous` / `pained`: a **sweat drop** sliding down;
    `laugh` / `grin` / `relief`: a small hop plus **sparkles**; `dazed`: the stars card.
  The effects ride the head through the hop (eyes stay on the face).
- **Actions get particles.** Impacts: `impactDust` (dust ring + hopping chunks) on landings, falls, slams, drops.
  Gunshots / metal / grinding: `sparks` (hot orange streaks fanned along the hit, falling under gravity, gone in
  ~0.5 s) with a muzzle burst. Shiny rewards / a key object arriving: `sparkles`. Magic, fire, sunsets: `embers`.
  Marching / running / driving on dirt: small looping dust puffs at the feet or wheels. Weather: `rain` streaks;
  `lightningStrike` (2 bright frames + 3 afterglow, a white-blue branching bolt) also returns a `flash` value: lift the
  sky/fog and the sun intensity by it for those frames.
- **Feel:** particles live 0.3-1.4 s, are deterministic (pure functions of time + seed: any frame renders alone), and
  sit on the main subject; never fill the frame, never cover a face or the subtitle line. Background scenery never
  emits particles unless the story is about it (the storm, the fire).
- **Check:** render strips of 3-6 frames across each reaction and action: the face changes on the frame, the squash
  lands, the glow blooms and the particles arc, fade and disappear.

## Scene dressing and liveliness (measured from `audio-sample/`; `templates/fx/dressing.ts`)
No sample frame shows bare ground or a bare wall. Before stills, every set must pass this list:
- **Ground:** grass tufts on every verge and field (thousands, densest along roads and walls, ~20 % dry/yellow in autumn), wildflower specks, gravel and pebbles on every road and track bed, a few rocks and round bushes. `tufts`, `flowers`, `pebbles`, `rocks`, `bushes` with `scatter` (area) or `along` (verge strip).
- **Lines that lead the eye:** a fence or telegraph/power line receding along each road (`fence`, `poles` with sagging wires). Pick what fits the era.
- **Props where people live or work:** crates, barrels, sandbags at military posts, woodpiles, benches, a blank signpost (`crate`, `barrel`, `sandbags`, `woodpile`, `bench`, `signpost`). Group them in 2-4 near doors and huts, never in a grid.
- **Rooms:** plank floor, wainscot with panels and a chair rail, 2+ framed pictures (landscape, sea, portrait, map, painted only, no text), bookcases, a rug under the main furniture, a plant in a corner, a cabinet or a wall clock, curtains on formal windows, and clutter on every desk (papers, pen pot, books, a period telephone). Use `onWall`, `wainscot`, `picture`, `bookcase`, `rug`, `plant`, `cabinet`, `wallClock`, `curtains`, `deskClutter`.
- **Ambient life (moves, never bounces):** a few birds gliding/flapping in outdoor skies (`Birds`, anchored once per shot ~70 m ahead, 26 m up), drifting leaves in tree or autumn shots (`leaves`), chimney smoke (`smoke`), glowing dust motes in indoor sunbeams (`motes`). Flags and cloth wave.
- **Crowds:** when a scene implies people (a council, a town, a schoolyard, an army), fill the back with extras that breathe and blink.
- **Checks on stills:** dressing must never sit between the lens and a face. Keep plants and props out of the desk/subject line, since a plant behind a desk reads as a lump on the desk. Small stacked boxes on a table read as toy bricks, so use papers instead. Keep dressing off the subject's silhouette, and keep poles out of the frame centre.

## Look-match loop (how the bridge look was reached; reuse for any "make it look like X" pass)
1. **Measure the reference first.** One analysis agent per topic (motion, depth, textures, characters, lighting, outlines, grade), each writing numbers, not adjectives, to `references/reports/<topic>.md`. Shared brief: `compare/CONTEXT.md`. Reports are the source of truth for every agent after.
2. **Sandboxes, one owner per file.** Copy the project folder to `src/videos/<name>_{cam,world,mat,char,post}` with entries `src/sandboxes/<n>/index.tsx` (same `index.tsx` as main, only the import path changed). Ownership used for the bridge:
   - cam: story.ts (camera keys, cuts, kicks, DOF table, foreground props)
   - world: world.ts, lights.ts, shade.ts, grade.ts (sun, sky, fog, river, colour, grade)
   - mat: paint.ts, build.ts (painted textures, buildings, props)
   - char: toon.ts, cast.ts, cardshade.ts (character drawing, posing, card lighting, fx cards)
   - post: ink.ts, Bridge.tsx, lensblur.ts (outline pass, composer, lens blur, bloom)
   Agents only edit their own files in their own sandbox and render stills with `BRIDGE_ENTRY=src/sandboxes/<n>/index.tsx node scripts/bridge-stills.mjs out/<name>/<n>/x_ <frames> 0.5`.
3. **Merge** with `python scripts/bridge_merge.py [cam,world,mat,char,post]` (backs main up to `backup/bridge_<time>/`, copies owned files only). Then `npx tsc --noEmit` (filter to the project folder), then **re-sync every sandbox from main** (`cp -f src/videos/<name>/* src/videos/<name>_<n>/`) before the next round.
4. **Verify** with a fresh Opus max agent: side-by-side sheets (`python scripts/sbs_sheet.py out.jpg --ours a b --ref r1 r2`), score each area out of 10 (colour day / golden, lighting, ink, textures, characters, depth, composition) plus a numbered fix list with frame numbers. Map each fix to the file owner and resume that owner's agent with SendMessage (keeps its context). Bridge scores: round 1 5/3/4/5/4/7/4/6 → round 2 5/4/5/6/4/7/6/6 → round 3 see notes.
5. Contracts between owners live in exported constants (e.g. `NOINK` layer from ink.ts, `dofAt`/`FOREGROUND` from story.ts, `LIGHTS`/`LOOK` from lights.ts). Changing a contract means telling every owner that reads it.

## Gotchas
- Kenney nature-kit materials are teal: recolour them by material name in build.ts.
- Cameras end up inside houses: the sight-line culler in build.ts/world.ts removes anything blocking any camera ray.
- Ink in the same merged effect pass as DOF gets overwritten. Ink must be its own pass before the blur.
- Pixel-sized post parameters must scale with resolution: stills are at 0.5, the final at 1.333. R3F clamps dpr to ≥ 1, so `--scale 0.5` stills still render a 1080x1920 buffer.
- **Disk:** every Remotion bundle copies `public/` (~1.3 GB) into `the temp folder\remotion-webpack-bundle-*` and never deletes it. 60+ GB filled the system drive during the bridge passes and a render died with ENOSPC. Always render with `export TEMP='<big drive>/remotion-tmp' TMP='<big drive>/remotion-tmp'` (bridge-stills.mjs sets it itself) and ask the user before deleting old bundle folders in the shared the temp folder (auto mode blocks the sweep). <big drive>/remotion-tmp fills too (~500 folders / 110 GB after the 4 bridge rounds): when a project is finished and nothing is rendering, delete its `remotion-webpack-bundle-*` and `puppeteer_dev_chrome_profile-*` folders there.
- In JS strings write `"<big drive>/remotion-tmp"`, never `"<big drive>\remotion-tmp"` (`\r` becomes a carriage return).
- Remotion writes a silent audio track: mux with `-map 0:v:0 -map 1:a:0`.
- Sub-agents can't write report files in this harness: ask them for a ≤150-word final message and save it yourself to `out/<name>/<n>/REPORT.md`.
- Scratch `.ts` files inside `out/` break `tsc`: name them `.txt`.
- 2K renders run ~4 fps (≈10 min for 67 s). Stills at 0.5 take 3-8 s each after a ~40 s bundle.
- Film grain at 2.5 % made the 2K file 910 MB instead of ~250 MB and will turn to mush on YouTube; the reference has none. Keep it off.

## Readability traps the verifier caught (check every new prop/shot for these)
- **A swing drawn as one rope that disappears behind the kid reads as a HANGING.** Always two ropes to a wide plank
  with the kid between them (`swingKid` in toon.ts), and a frame whose legs clear the arc (A-frame at each end).
- Props or flotsam closer than ~2 m to a lens become huge cut-off blobs at the frame edge. When a camera moves, re-check
  every prop near its new position (the river cameras moved into the floating hats).
- A foreground bush cut by the frame edge reads as a "green ball"; a foreground prop must be recognisable or gone.
- Flags: red + yellow star/diamond reads as Vietnam's. Use a period-correct flag (St George's cross for England 1831).
- Painted signs lit by a side sun go grey-blue and unreadable: give the sign face an unlit material.
- Golden rim light done as an offset outer copy turns every hat into a picture frame: inner rim only, head/torso only.
- Balcony/railing rails at chest height through characters: put the lens ~2.5 m up so rails cross legs, not torsos.
- Flat holds read as freezes in QA (frozen span ≥12 f): every hold needs a creeping push-in.
