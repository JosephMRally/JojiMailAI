#!/usr/bin/env python
"""Generate docs/diagrams/ui_flow.png — flow diagram for the mailbox refresh
loop (user-stories/typescript_email_ui.md): provider fetch with error copy
keyed off MailProviderError.code, store upsert of threads and message bodies,
and the store-first render — offline reading and exact text search always
survive.

Reproducible: .venv/bin/python docs/diagrams/src/ui_flow.py
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon

INK = "#0f172a"
MUTED = "#475569"
LINE = "#94a3b8"
PROCESS = "#e2e8f0"   # neutral process step
TERMINAL = "#dbeafe"  # entry / result
DECISION = "#fde68a"  # branch
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
    fig, ax = plt.subplots(figsize=(11.8, 10.2))
    ax.set_xlim(0, 15.4)
    ax.set_ylim(0, 14)
    ax.axis("off")

    ax.text(0.3, 13.7, "Mailbox refresh — flow: provider sync → store upsert → store-first render",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.3, 13.18, "user-stories/typescript_email_ui.md · network failures degrade to stored mail; exact text search over the store",
            fontsize=9, color=MUTED, ha="left", va="top")

    cx = 5.0
    process(ax, cx, 12.3, "UI Refresh (or Load more with\nthe page's nextPageToken)", w=6.0, h=1.1, fill=TERMINAL)
    process(ax, cx, 10.75, "provider.listThreads(tagId, { pageSize, pageToken? })", w=6.6, h=0.9)
    decision(ax, cx, 8.9, "provider call\nfailed?", w=4.2, h=1.4)
    process(ax, 11.5, 8.9,
            "normalized error via MailProviderError.code\n(AUTH_REQUIRED shows its own copy;\nNETWORK offers Retry) —\nstored mail stays listed",
            w=5.9, h=1.9, fill=TERMINAL)
    process(ax, cx, 6.9, "store.upsertThreads(page.threads)", w=6.0, h=0.9)
    process(ax, cx, 4.9,
            "for each thread:\nstore.upsertMessages(provider.getThread(threadId))\n— a failed body fetch leaves the summary usable",
            w=7.2, h=1.5)
    process(ax, cx, 2.5,
            "re-read store.listThreads → render rows\n(sender · subject · snippet · date · count · tags,\nunread badge); show Load more iff nextPageToken",
            w=7.2, h=1.6, fill=TERMINAL)

    # Main path.
    edge(ax, cx, 11.75, cx, 11.2)
    edge(ax, cx, 10.3, cx, 9.6)
    edge(ax, 7.1, 8.9, 8.55, 8.9)
    ax.text(7.2, 9.08, "yes", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 8.2, cx, 7.35, label="no")
    edge(ax, cx, 6.45, cx, 5.65)
    edge(ax, cx, 4.15, cx, 3.3)

    # Search shares the same store-first render (exact text, no AI).
    process(ax, 12.35, 11.4,
            "search box → store.searchText(query):\ntokenize + match stored subject/body (exact);\nfilter rows to matching threads; empty query\nrestores the list; all-stop-word query →\n'too generic' notice",
            w=5.9, h=2.2, fill=NOTE)

    # Legend (kept clear of the flow's center column and the right-side boxes).
    lx, ly = 10.6, 5.7
    for dy, (fill, label) in enumerate([(TERMINAL, "entry / result"),
                                        (PROCESS, "processing step"),
                                        (DECISION, "decision")]):
        ax.add_patch(FancyBboxPatch((lx, ly - dy * 0.62), 0.5, 0.34,
                                    boxstyle="round,pad=0.05", linewidth=1.0,
                                    facecolor=fill, edgecolor=LINE))
        ax.text(lx + 0.75, ly - dy * 0.62 + 0.17, label, ha="left", va="center",
                fontsize=8.6, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "ui_flow.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
