#!/usr/bin/env python
"""Generate docs/diagrams/intelligence_flow.png — flow diagram for one
LocalIntelligence structured request (user-stories/typescript_mail_intelligence.md):
config, strict json_schema request, transport-error mapping, JSON parse and
zod validation with exactly one retry, and the AI_BAD_OUTPUT exit.

Reproducible: .venv/bin/python docs/diagrams/src/intelligence_flow.py
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

    ax.text(0.3, 17.1, "LocalIntelligence.requestStructured — flow: constrained request → validate → one retry",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.3, 16.55, "user-stories/typescript_mail_intelligence.md · shared by classify, summarizeThread, draftReply, parseSearchQuery",
            fontsize=9, color=MUTED, ha="left", va="top")

    cx = 5.0
    process(ax, cx, 15.6, "flow builds its prompt + zod/json schemas\n(truncated bodies keep local context windows small)", w=6.6, h=1.1, fill=TERMINAL)
    process(ax, cx, 14.0, "create() params: model = VITE_AI_MODEL,\nresponse_format json_schema strict:true,\ntemperature 0 when the flow is deterministic", w=6.0, h=1.4)
    decision(ax, cx, 12.0, "transport\nerror?")
    process(ax, 11.6, 12.0, "map most-specific-first:\nAPIConnectionError → AI_UNAVAILABLE\nstatus 404 → AI_MODEL_NOT_FOUND\nelse → AI_ERROR — never retried", w=5.2, h=1.8, fill=TERMINAL)
    decision(ax, cx, 9.9, "content parses\nas JSON?")
    decision(ax, cx, 7.6, "zod schema\naccepts?")
    process(ax, 11.6, 7.6, "return the validated,\ntyped result", w=4.2, h=1.1, fill=TERMINAL)
    decision(ax, cx, 5.2, "first\nattempt?")
    process(ax, 11.6, 5.2, "throw MailIntelligenceError\n('AI_BAD_OUTPUT', names the\nschema that failed)", w=4.6, h=1.4, fill=TERMINAL)

    edge(ax, cx, 15.05, cx, 14.7)
    edge(ax, cx, 13.3, cx, 12.75)
    edge(ax, 7.2, 12.0, 9.0, 12.0)
    ax.text(7.3, 12.18, "yes — throw", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 11.25, cx, 10.65, label="no — got a completion")
    edge(ax, cx, 9.15, cx, 8.35, label="yes")
    edge(ax, 7.2, 7.6, 9.5, 7.6)
    ax.text(7.35, 7.78, "yes", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 6.85, cx, 5.95, label="no — invalid shape")
    # Malformed JSON also falls through to the retry decision.
    ax.plot([2.8, 1.5, 1.5], [9.9, 9.9, 5.2], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 1.5, 5.2, 2.8, 5.2)
    ax.text(0.7, 9.55, "no —\nmalformed", ha="left", va="top", fontsize=8.4, color=INK, fontweight="bold")
    # Retry loop back to create().
    ax.plot([2.8, 0.6, 0.6, 1.9], [4.9, 4.9, 14.0, 14.0], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 0.6, 14.0, 2.0, 14.0)
    ax.text(1.15, 4.55, "yes — retry the identical request once", ha="left", va="top",
            fontsize=8.4, color=INK, fontweight="bold")
    edge(ax, 7.2, 5.2, 9.3, 5.2)
    ax.text(7.3, 5.38, "no — retry spent", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")

    ax.text(0.6, 2.9, "Every exit is a typed result or a MailIntelligenceError the UI keys copy off — AI failure\ndegrades tagging/digests/drafts/search interpretation and never blocks reading or sending mail.",
            ha="left", va="top", fontsize=8.6, color=MUTED)

    # Legend.
    lx, ly = 11.6, 15.9
    for dy, (fill, label) in enumerate([(TERMINAL, "entry / exit"),
                                        (PROCESS, "processing step"),
                                        (DECISION, "decision")]):
        ax.add_patch(FancyBboxPatch((lx, ly - dy * 0.62), 0.5, 0.34,
                                    boxstyle="round,pad=0.05", linewidth=1.0,
                                    facecolor=fill, edgecolor=LINE))
        ax.text(lx + 0.75, ly - dy * 0.62 + 0.17, label, ha="left", va="center",
                fontsize=8.6, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "intelligence_flow.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
