#!/usr/bin/env python
"""Generate docs/diagrams/ui_flow.png — flow diagram for the mailbox refresh
loop (user-stories/typescript_email_ui.md): provider fetch with error copy
keyed off MailProviderError.code, store upsert, AI classification of newly
arrived threads that degrades on MailIntelligenceError, and the store-first
render with importance ordering — offline reading always survives.

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
    fig, ax = plt.subplots(figsize=(11.8, 13.2))
    ax.set_xlim(0, 15.4)
    ax.set_ylim(0, 18.2)
    ax.axis("off")

    ax.text(0.3, 17.9, "Mailbox refresh — flow: provider sync → store upsert → AI triage → store-first render",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.3, 17.35, "user-stories/typescript_email_ui.md · AI and network failures degrade; stored mail always renders",
            fontsize=9, color=MUTED, ha="left", va="top")

    cx = 5.0
    process(ax, cx, 16.3, "user taps Refresh (or Load more with\nthe page's nextPageToken)", w=6.0, h=1.1, fill=TERMINAL)
    process(ax, cx, 14.8, "provider.listThreads(tagId, { pageSize, pageToken? })", w=6.6, h=0.9)
    decision(ax, cx, 13.2, "MailProviderError?", w=4.2, h=1.3)
    process(ax, 11.5, 13.2, "error copy keyed off code:\nAUTH_REQUIRED → its own message\nNETWORK → alert with Retry",
            w=5.6, h=1.6)
    process(ax, 11.5, 10.9, "stored rows stay listed —\npreviously synced mail is still\nreadable offline (MailStore)",
            w=5.6, h=1.6, fill=TERMINAL)
    process(ax, cx, 11.5, "store.upsertThreads(page.threads);\nprovider.getThread → store.upsertMessages\nper thread", w=6.4, h=1.5)
    decision(ax, cx, 9.5, "thread new\nto the app?", w=3.8, h=1.4)
    process(ax, cx, 7.6, "intelligence.classify(newest, tags)", w=5.4, h=0.9)
    decision(ax, cx, 5.9, "MailIntelligence-\nError?", w=3.9, h=1.4)
    process(ax, 11.5, 5.9, "status notice with the error code\n(e.g. AI tagging unavailable\n(AI_UNAVAILABLE)) — sync continues",
            w=5.8, h=1.6)
    process(ax, cx, 3.9, "provider.addTag(messageId, suggested) when\nsupportsTags — rendered as distinct 'AI' chips\nwith one-tap undo (removeTag reverses)", w=6.8, h=1.5)
    process(ax, cx, 1.6, "re-read store.listThreads → order by AI importance\n(high → normal → low, toggle to pure date order) →\nrender rows; show Load more iff nextPageToken", w=7.2, h=1.5, fill=TERMINAL)

    # Main path.
    edge(ax, cx, 15.75, cx, 15.25)
    edge(ax, cx, 14.35, cx, 13.85)
    edge(ax, 7.1, 13.2, 8.7, 13.2)
    ax.text(7.2, 13.38, "yes", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, 11.5, 12.4, 11.5, 11.7)
    edge(ax, cx, 12.55, cx, 12.25, label="no")
    edge(ax, cx, 10.75, cx, 10.2)
    edge(ax, cx, 8.8, cx, 8.05, label="yes — newest message")
    edge(ax, cx, 7.15, cx, 6.6)
    edge(ax, 6.95, 5.9, 8.6, 5.9)
    ax.text(7.05, 6.08, "yes", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 5.2, cx, 4.65, label="no — { tagIds, importance }")
    edge(ax, cx, 3.15, cx, 2.35)

    # Known threads skip classification.
    ax.plot([3.1, 1.0, 1.0], [9.5, 9.5, 1.6], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 1.0, 1.6, 1.4, 1.6)
    ax.text(0.6, 8.9, "no — already known:\nnever re-classified,\nnever re-tagged",
            ha="left", va="top", fontsize=8.4, color=INK, fontweight="bold")

    # AI failure path rejoins the render.
    ax.plot([11.5, 11.5], [5.1, 2.35], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 11.5, 2.35, 8.65, 1.85)
    ax.text(11.7, 3.9, "core flow intact —\nlist, read, tag, compose,\nsend all still work",
            ha="left", va="top", fontsize=8.4, color=INK, fontweight="bold")

    # Note: search shares the same store-first render.
    process(ax, 12.6, 16.1, "search box: intelligence.parseSearchQuery →\nremovable criteria chips; text terms →\nstore.searchText (Bloom prescreen); tag/from/\ndate criteria filter the store's rows",
            w=5.2, h=1.9, fill=NOTE)

    # Legend (kept clear of the flow's left column).
    lx, ly = 0.35, 13.3
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
