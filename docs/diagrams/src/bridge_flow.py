#!/usr/bin/env python
"""Generate docs/diagrams/bridge_flow.png — flow diagram for one request
through the Gmail bridge (user-stories/python_gmail_bridge.md): request
validation, the lazy Gmail client with the AUTH_REQUIRED cold-start path,
the simplegmail call, and error normalization into {code, message}.

Reproducible: .venv/bin/python docs/diagrams/src/bridge_flow.py
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon

INK = "#0f172a"
MUTED = "#475569"
LINE = "#94a3b8"
PROCESS = "#e2e8f0"
TERMINAL = "#dbeafe"
DECISION = "#fde68a"
NOTE = "#f8fafc"


def process(ax, x, y, text, w=4.6, h=1.0, fill=PROCESS):
    ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h,
                                boxstyle="round,pad=0.1", linewidth=1.1,
                                facecolor=fill, edgecolor=LINE))
    ax.text(x, y, text, ha="center", va="center", fontsize=9, color=INK)


def decision(ax, x, y, text, w=4.4, h=1.5):
    ax.add_patch(Polygon([(x, y + h / 2), (x + w / 2, y), (x, y - h / 2), (x - w / 2, y)],
                         closed=True, linewidth=1.1, facecolor=DECISION, edgecolor=LINE))
    ax.text(x, y, text, ha="center", va="center", fontsize=8.8, color=INK)


def edge(ax, x1, y1, x2, y2, label=""):
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle="-|>", color=MUTED, linewidth=1.2,
                                shrinkA=0, shrinkB=4))
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(mx + 0.18, my + 0.08, label, ha="left", va="bottom",
                fontsize=8.6, color=INK, fontweight="bold")


def main() -> None:
    fig, ax = plt.subplots(figsize=(11.4, 12.6))
    ax.set_xlim(0, 15)
    ax.set_ylim(0, 17.4)
    ax.axis("off")

    ax.text(0.3, 17.1, "Gmail bridge — flow: one HTTP request in, one wire-schema response out",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.3, 16.55, "user-stories/python_gmail_bridge.md · every failure is {code, message} — never a stack trace or FastAPI detail shape",
            fontsize=9, color=MUTED, ha="left", va="top")

    cx = 5.0
    process(ax, cx, 15.5, "HTTP request from the proxy\n(/tags · /threads · /threads/{id} · /messages/{id} ·\n/messages/send · /messages/{id}/modify · /threads/{id}/modify)",
            w=6.6, h=1.4, fill=TERMINAL)
    decision(ax, cx, 13.5, "params / body\nvalid?")
    process(ax, 11.6, 13.5, "422 {code: PROVIDER_ERROR,\nmessage: 'invalid request: …'}\n(wire error schema, detail kept)", w=4.9, h=1.4, fill=TERMINAL)
    decision(ax, cx, 11.4, "Gmail client\nbuilt yet?")
    decision(ax, 11.6, 11.4, "token or OAuth\nclient file exists?", w=4.6)
    process(ax, 11.6, 9.3, "401 {code: AUTH_REQUIRED,\nmessage: names both paths and says\nrun once with a browser}", w=4.9, h=1.4, fill=TERMINAL)
    process(ax, cx, 9.3, "build simplegmail Gmail once\n(browser OAuth on cold start,\nsaved token reused after);\ncache for every later request", w=5.2, h=1.6)
    process(ax, cx, 7.15, "do the Gmail work via the fork\n(labels · refs list + hydrate · send ·\nlabel changes per message or thread-wide)", w=5.6, h=1.4)
    decision(ax, cx, 5.1, "Gmail call\nraised?")
    process(ax, 11.6, 5.1, "map by HTTP status:\n401→AUTH_REQUIRED · 404→NOT_FOUND\n429→RATE_LIMITED · else→PROVIDER_ERROR\nrespond {code, message} + mapped status", w=5.4, h=1.7, fill=TERMINAL)
    process(ax, cx, 3.0, "serialize snake_case wire JSON\n(dates → one epoch-ms int · bodies omitted when absent ·\nsender str, recipient/cc/bcc lists · labels = tag_ids)", w=6.6, h=1.4)
    process(ax, cx, 1.1, "200 wire response", w=3.6, h=0.9, fill=TERMINAL)

    edge(ax, cx, 14.8, cx, 14.25)
    edge(ax, 7.2, 13.5, 9.1, 13.5)
    ax.text(7.3, 13.68, "no", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 12.75, cx, 12.15, label="yes")
    edge(ax, 7.2, 11.4, 9.25, 11.4)
    ax.text(7.35, 11.58, "no — first request", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, 11.6, 10.65, 11.6, 10.0)
    ax.text(11.75, 10.42, "neither", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, 9.3, 11.4, 7.65, 10.2)
    ax.text(7.75, 10.95, "exists — build", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    # Cached client: skip the build box entirely, straight to the Gmail work.
    ax.plot([2.8, 1.5, 1.5], [11.4, 11.4, 7.15], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 1.5, 7.15, 2.2, 7.15)
    ax.text(0.62, 10.95, "yes —\ncached", ha="left", va="top", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 8.5, cx, 7.85)
    edge(ax, cx, 6.45, cx, 5.85)
    edge(ax, 7.2, 5.1, 8.9, 5.1)
    ax.text(7.3, 5.28, "yes", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 4.35, cx, 3.7, label="no")
    edge(ax, cx, 2.3, cx, 1.55)

    # Legend.
    lx, ly = 11.0, 15.9
    for dy, (fill, label) in enumerate([(TERMINAL, "entry / response"),
                                        (PROCESS, "processing step"),
                                        (DECISION, "decision")]):
        ax.add_patch(FancyBboxPatch((lx, ly - dy * 0.62), 0.5, 0.34,
                                    boxstyle="round,pad=0.05", linewidth=1.0,
                                    facecolor=fill, edgecolor=LINE))
        ax.text(lx + 0.75, ly - dy * 0.62 + 0.17, label, ha="left", va="center",
                fontsize=8.6, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "bridge_flow.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
