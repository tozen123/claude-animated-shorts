"""Make the narration (voice.wav) and its word timings (words.json) with ElevenLabs text-to-speech.

Pipeline step 3 of SKILL.md. Reads the script lines from SCRIPT.md (the "| # | Beat | Line |" table) or from a .txt
file (one line per beat). It sends the whole script in one request so the read keeps one steady, story-telling flow,
and gets character timestamps back. Those become words.json: [{"w": "word", "s": start_s, "e": end_s}, ...], which
is what story.ts timing and templates/audio/mix.py read.

API key: put ELEVENLABS_API_KEY=... in the .env file at the repo root (git-ignored; .env.example shows the format),
or set it in your environment. The key is never printed or written anywhere by this tool.

usage (projects live in projects/<name>/ with a SCRIPT.md):
  python templates/voice/make_voice.py --list "David"              # find voices called David (yours + the library)
  python templates/voice/make_voice.py projects/road --voice "David"  # SCRIPT.md -> voice/voice.wav + voice/words.json
  python make_voice.py <project_dir> --voice-id <id> [--model eleven_v3] [--stability 0.4] [--style 0.6] [--speed 1.0]
  python make_voice.py <project_dir> --voice "David" --takes 3   # several takes (voice/takes/), pick one with --use N

Options that matter for an emotional, entertaining story read:
  --model eleven_v3 (default): the most expressive model that takes plain text-to-speech; it also understands
          audio tags written into the script line, e.g. "[excited]", "[whispers]", "[laughs]", "[sighs]".
          Fall back to eleven_multilingual_v2 if your plan or the timestamps endpoint refuses v3.
  --stability: lower = more emotional range (v3 accepts 0.0 creative, 0.5 natural, 1.0 robust).
  --style / --speed: style exaggeration (v2 models) and speaking speed (0.7-1.2).
Target pace for these shorts is 3.4-3.8 words/s with almost no pauses (measured from the reference narration).
"""
import argparse, base64, json, os, re, subprocess, sys, urllib.parse, urllib.request, urllib.error

API = "https://api.elevenlabs.io"
REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root (holds the .env)


# ---------------------------------------------------------------- helpers
def api_key(project=None):
    k = os.environ.get("ELEVENLABS_API_KEY") or os.environ.get("XI_API_KEY")
    for d in [project, REPO, os.getcwd()]:
        if k or not d:
            continue
        p = os.path.join(d, ".env")
        if os.path.exists(p):
            for line in open(p, encoding="utf-8"):
                m = re.match(r"\s*(ELEVENLABS_API_KEY|XI_API_KEY)\s*=\s*['\"]?([^'\"\s]+)", line)
                if m:
                    k = m.group(2)
    if not k:
        sys.exit("No ElevenLabs API key: paste it after ELEVENLABS_API_KEY= in the .env file at the repo root.")
    return k


def call(method, path, key, body=None, query=None):
    url = API + path + ("?" + urllib.parse.urlencode(query) if query else "")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method,
                                 headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read().decode()), dict(r.headers)
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace")[:600]
        hint = ""
        if "voices_read" in msg:
            hint = ("\n  -> This key cannot look voices up. Either turn on 'Voices: Read' for the key (elevenlabs.io > Developers >"
                    " API Keys), or skip the search: open the voice on elevenlabs.io, copy its Voice ID and pass --voice-id <id>.")
        elif "paid_plan_required" in msg:
            hint = ("\n  -> Free plans cannot use Voice Library voices through the API. Generate the read on elevenlabs.io"
                    " (Text to Speech, same voice), download it, then run: make_voice.py <project> --from-file <downloaded.mp3>")
        elif "text_to_speech" in msg:
            hint = "\n  -> Turn on 'Text to Speech' access for this key (elevenlabs.io > Developers > API Keys)."
        raise SystemExit(f"ElevenLabs {method} {path} -> HTTP {e.code}: {msg}{hint}")


def find_voices(name, key):
    """Your own + premade voices first (usable directly), then matches in the public voice library."""
    out = []
    mine, _ = call("GET", "/v2/voices", key, query={"search": name, "page_size": 50})
    for v in mine.get("voices", []):
        out.append({"source": "account", "voice_id": v["voice_id"], "name": v["name"],
                    "category": v.get("category", ""), "labels": v.get("labels") or {}})
    try:
        lib, _ = call("GET", "/v1/shared-voices", key, query={"search": name, "page_size": 30, "language": "en"})
        for v in lib.get("voices", []):
            out.append({"source": "library", "voice_id": v["voice_id"], "name": v["name"], "category": v.get("category", ""),
                        "public_owner_id": v.get("public_owner_id"), "labels": {k: v.get(k) for k in ("gender", "age", "accent", "use_case", "descriptive") if v.get(k)}})
    except SystemExit as e:
        print("  (library search unavailable:", str(e)[:120], ")")
    return out


def resolve_voice(args, key):
    if args.voice_id:
        return args.voice_id
    hits = find_voices(args.voice, key)
    exact = [h for h in hits if h["name"].lower().split(" - ")[0].strip() == args.voice.lower()] or hits
    if not exact:
        sys.exit(f"No voice found for '{args.voice}'. Try --list '{args.voice}'.")
    acc = [h for h in exact if h["source"] == "account"]
    if acc:
        h = acc[0]
    else:
        h = exact[0]
        # a library voice must be added to the account once before it can be used
        print(f"  adding library voice '{h['name']}' ({h['voice_id']}) to your account")
        call("POST", f"/v1/voices/add/{h['public_owner_id']}/{h['voice_id']}", key, body={"new_name": h["name"]})
    print(f"  voice: {h['name']} [{h['source']}] id {h['voice_id']}")
    return h["voice_id"]


def script_lines(path):
    if path.lower().endswith(".md"):
        lines = []
        for row in open(path, encoding="utf-8"):
            m = re.match(r"\|\s*\d+\s*\|[^|]*\|\s*(.+?)\s*\|\s*$", row)
            if m:
                lines.append(m.group(1))
        return lines
    return [l.strip() for l in open(path, encoding="utf-8") if l.strip()]


TAG = re.compile(r"\[[^\]]*\]")   # v3 audio tags like [excited]: spoken as emotion, never as words


def words_from_alignment(al):
    """Group character timestamps into words; audio tags are dropped."""
    chars, s, e = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    text = "".join(chars)
    keep = [True] * len(chars)
    for m in TAG.finditer(text):
        for i in range(m.start(), m.end()):
            keep[i] = False
    words, cur = [], None
    for i, c in enumerate(chars):
        if not keep[i] or c.isspace():
            if cur:
                words.append(cur); cur = None
            continue
        if cur is None:
            cur = {"w": c, "s": s[i], "e": e[i]}
        else:
            cur["w"] += c; cur["e"] = e[i]
    if cur:
        words.append(cur)
    words = [w for w in words if re.search(r"[A-Za-z0-9]", w["w"])]
    for w in words:
        w["w"] = w["w"].strip(" \"'“”‘’")
        w["s"], w["e"] = round(w["s"], 3), round(w["e"], 3)
    return words


def whisper_words(wav):
    """Fallback when a model returns no alignment: word times from faster-whisper (pip install faster-whisper)."""
    from faster_whisper import WhisperModel
    segs, _ = WhisperModel("small.en", device="cpu", compute_type="int8").transcribe(wav, word_timestamps=True)
    return [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)} for sg in segs for w in sg.words]


def loudness(wav):
    e = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", wav, "-af", "ebur128", "-f", "null", "-"],
                       capture_output=True, text=True).stderr
    m = re.search(r"I:\s+(-?[\d.]+) LUFS", e[e.rfind("Summary"):])
    return float(m.group(1)) if m else float("nan")


def tighten(vdir, sent=0.24, comma=0.14, xf=0.008):
    """The reference narration runs with almost no pauses (0-2 gaps > 0.35 s per short). Cut each silent gap between
    words down to `sent` (after . ? !) or `comma` seconds, only where the audio really is silent, with short crossfades;
    shift words.json by the time removed. The original stays as voice_untightened.wav / words_untightened.json."""
    import numpy as np, shutil, wave
    wav, wj = os.path.join(vdir, "voice.wav"), os.path.join(vdir, "words.json")
    for a, b in ((wav, "voice_untightened.wav"), (wj, "words_untightened.json")):
        if not os.path.exists(os.path.join(vdir, b)):
            shutil.copy2(a, os.path.join(vdir, b))
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", os.path.join(vdir, "voice_untightened.wav"), "-f", "f32le", "-ac", "1", "-ar", "48000", "-"],
                         capture_output=True, check=True).stdout
    y, sr = np.frombuffer(raw, np.float32).copy(), 48000
    words = json.load(open(os.path.join(vdir, "words_untightened.json"), encoding="utf-8"))
    peak = np.abs(y).max() or 1.0
    cuts = []
    for a, b in zip(words, words[1:]):
        keep = sent if a["w"].rstrip("\"'”’)")[-1:] in ".?!" else comma
        gap = b["s"] - a["e"]
        if gap <= keep + 0.03:
            continue
        c0, c1 = int((a["e"] + keep / 2) * sr), int((b["s"] - keep / 2) * sr)
        if c1 - c0 < int(0.03 * sr) or np.abs(y[c0:c1]).max() > 0.06 * peak:  # not silent: leave it alone
            continue
        cuts.append((c0, c1))
    n = int(xf * sr); ramp = np.linspace(0, 1, n, dtype=np.float32)
    out, pos = [], 0
    for c0, c1 in cuts:
        seg = y[pos:c0].copy()
        if out and n:  # crossfade the join
            prev = out[-1]; k = min(n, len(prev), len(seg))
            prev[-k:] = prev[-k:] * (1 - ramp[:k]) + seg[:k] * ramp[:k]; seg = seg[k:]
        out.append(seg); pos = c1
    out.append(y[pos:])
    z = np.concatenate(out)
    removed = lambda t: sum((c1 - c0) / sr for c0, c1 in cuts if c1 / sr <= t + 1e-6)
    for w in words:
        d = removed(w["s"]); w["s"] = round(w["s"] - d, 3); w["e"] = round(w["e"] - d, 3)
    pcm = (np.clip(z, -1, 1) * 8388607).astype(np.int32)
    b24 = np.frombuffer(pcm.astype("<i4").tobytes(), np.uint8).reshape(-1, 4)[:, :3].tobytes()
    with wave.open(wav, "wb") as f:
        f.setnchannels(1); f.setsampwidth(3); f.setframerate(sr); f.writeframes(b24)
    json.dump(words, open(wj, "w", encoding="utf-8"), indent=0)
    span = words[-1]["e"] - words[0]["s"]
    print(f"  tightened {len(cuts)} pauses: {len(y) / sr:.1f}s -> {len(z) / sr:.1f}s, {len(words) / span:.2f} words/s -> {wav}")


# ---------------------------------------------------------------- main
def take(args, key, voice_id, text, out_dir, n):
    body = {"text": text, "model_id": args.model,
            "voice_settings": {"stability": args.stability, "similarity_boost": args.similarity,
                               "style": args.style, "use_speaker_boost": True, "speed": args.speed}}
    if args.seed is not None:
        body["seed"] = args.seed + n
    res, _ = call("POST", f"/v1/text-to-speech/{voice_id}/with-timestamps", key, body=body,
                  query={"output_format": args.format})
    os.makedirs(out_dir, exist_ok=True)
    raw = os.path.join(out_dir, "voice_raw.mp3" if args.format.startswith("mp3") else "voice_raw.pcm")
    open(raw, "wb").write(base64.b64decode(res["audio_base64"]))
    wav = os.path.join(out_dir, "voice.wav")
    inp = ["-f", "s16le", "-ar", args.format.split("_")[1], "-ac", "1", "-i", raw] if raw.endswith(".pcm") else ["-i", raw]
    # 48 kHz mono 24-bit, gain only (the mix sets the final level; the skill keeps the voice unprocessed)
    subprocess.run(["ffmpeg", "-v", "error", "-y", *inp, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", wav], check=True)
    al = res.get("alignment") or res.get("normalized_alignment")
    words = words_from_alignment(al) if al and al.get("characters") else whisper_words(wav)
    json.dump(words, open(os.path.join(out_dir, "words.json"), "w", encoding="utf-8"), indent=0)
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]))
    span = words[-1]["e"] - words[0]["s"] if words else dur
    print(f"  take {n}: {dur:.1f}s, {len(words)} words, {len(words) / max(span, 1e-6):.2f} words/s, {loudness(wav):.1f} LUFS -> {wav}")
    return wav


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("project", nargs="?", help="folder with SCRIPT.md (output goes to <project>/voice/)")
    ap.add_argument("--script", help="script file (default <project>/SCRIPT.md)")
    ap.add_argument("--list", metavar="NAME", help="list voices matching NAME and exit")
    ap.add_argument("--voice", default="David", help="voice name to search for (default David)")
    ap.add_argument("--voice-id", help="exact ElevenLabs voice_id (skips the search)")
    ap.add_argument("--model", default="eleven_v3")
    ap.add_argument("--stability", type=float, default=0.5)
    ap.add_argument("--similarity", type=float, default=0.75)
    ap.add_argument("--style", type=float, default=0.0)
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--seed", type=int)
    ap.add_argument("--format", default="mp3_44100_128", help="ElevenLabs output_format (mp3_44100_128 works on every plan)")
    ap.add_argument("--tight", action="store_true", help="join the script lines into one paragraph (fewer, shorter pauses: the fast, gap-free read of the reference shorts)")
    ap.add_argument("--takes", type=int, default=1, help="make N takes in voice/takes/<n>/")
    ap.add_argument("--use", type=int, help="copy take N to voice/voice.wav + voice/words.json")
    ap.add_argument("--tighten", action="store_true", help="shorten silent pauses in <project>/voice/voice.wav (sentence ends 0.24 s, commas 0.14 s) and shift words.json to match; keeps voice_untightened.wav")
    ap.add_argument("--from-file", metavar="AUDIO", help="use an audio file you made elsewhere (e.g. downloaded from elevenlabs.io): "
                    "converts it to voice/voice.wav and makes words.json with faster-whisper; no API key needed")
    args = ap.parse_args()

    if args.tighten:
        if not args.project:
            ap.error("project folder required")
        tighten(os.path.join(args.project, "voice"))
        return
    if args.from_file:
        if not args.project:
            ap.error("project folder required")
        vdir = os.path.join(args.project, "voice"); os.makedirs(vdir, exist_ok=True)
        wav = os.path.join(vdir, "voice.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", args.from_file, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", wav], check=True)
        words = whisper_words(wav)
        json.dump(words, open(os.path.join(vdir, "words.json"), "w", encoding="utf-8"), indent=0)
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]))
        span = words[-1]["e"] - words[0]["s"] if words else dur
        print(f"  {dur:.1f}s, {len(words)} words, {len(words) / max(span, 1e-6):.2f} words/s, {loudness(wav):.1f} LUFS -> {wav}")
        return

    if args.list:
        key = api_key(args.project)
        for h in find_voices(args.list, key):
            lab = ", ".join(f"{v}" for v in h["labels"].values() if v)
            print(f"{h['source']:8s} {h['voice_id']}  {h['name']}  ({h['category']}; {lab})")
        return
    if not args.project:
        ap.error("project folder required")
    vdir = os.path.join(args.project, "voice")
    if args.use:
        import shutil
        for f in ("voice.wav", "words.json"):
            shutil.copy2(os.path.join(vdir, "takes", str(args.use), f), os.path.join(vdir, f))
        print("using take", args.use)
        return

    key = api_key(args.project)
    lines = script_lines(args.script or os.path.join(args.project, "SCRIPT.md"))
    if not lines:
        sys.exit("No script lines found (expected a '| # | Beat | Line |' table in SCRIPT.md, or a .txt file).")
    text = (" " if args.tight else "\n\n").join(lines)
    print(f"  script: {len(lines)} lines, {len(TAG.sub('', text).split())} words, {len(text)} characters, model {args.model}")
    voice_id = resolve_voice(args, key)
    if args.takes == 1:
        take(args, key, voice_id, text, vdir, 1)
    else:
        for n in range(1, args.takes + 1):
            take(args, key, voice_id, text, os.path.join(vdir, "takes", str(n)), n)
        print("listen to voice/takes/*/voice.wav, then run again with --use N")


if __name__ == "__main__":
    main()
