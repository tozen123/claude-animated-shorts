"""Print the shot start frames of the road short (mirrors story.ts cuts) and a mid frame per shot."""
import json, re, sys
W = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "src/videos/road/words.json", encoding="utf-8"))
N = [re.sub(r"[^a-z0-9']", "", w["w"].lower().replace("’", "'")) for w in W]
def at(ph, after=0):
    p = ph.split()
    for i in range(len(N) - len(p) + 1):
        if W[i]["s"] >= after and N[i:i + len(p)] == p: return W[i]["s"]
    raise SystemExit("missing " + ph)
cuts = [0, at("you see"), at("forty miles"), at("on opening day"), at("truckers set"), at("a week later"), at("then another"), at("so bernie puts"),
        at("start counting"), at("then the town ambulance"), at("luckily"), at("so what's going on"), at("in simulator tests"), at("that's why germany"),
        at("so bernie bends"), at("and his town finally")]
fr = [0] + [max(0, round(t * 30) - 2) for t in cuts[1:]]
total = round((W[-1]["e"] + 1.1) * 30)
ends = fr[1:] + [total]
print("starts", fr, "total", total)
print(",".join(str((a + b) // 2) for a, b in zip(fr, ends)))
