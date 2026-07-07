#!/usr/bin/env python
"""Generate docs/diagrams/store_flow.png — flow diagram for MailStore
searchText (user-stories/typescript_mail_store.md): shared tokenization,
the too-generic fast path, Bloom prescreening (ALL terms), and verification
against stored text so results equal a full scan.

Reproducible: .venv/bin/python docs/diagrams/src/store_flow.py
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
    """Straight arrow from (x1, y1) to (x2, y2) with an optional bold label."""
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

    ax.text(0.3, 17.1, "MailStore.searchText — flow: tokenize → Bloom prescreen → verify",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.3, 16.55, "user-stories/typescript_mail_store.md · identical to a full scan, never a missed or phantom result",
            fontsize=9, color=MUTED, ha="left", va="top")

    cx = 5.0
    process(ax, cx, 15.6, "searchText(accountId, terms)", fill=TERMINAL)
    process(ax, cx, 14.1, "tokenize(terms) — shared tokenize.ts:\nlowercase · split non-alphanumeric runs\ndrop <2-char tokens and ~175 stop words", h=1.5)
    decision(ax, cx, 12.1, "any tokens\nleft?")
    process(ax, 11.6, 12.1, "return { messages: [],\ntooGeneric: true }", w=4.2, h=1.2, fill=TERMINAL)
    process(ax, cx, 10.3, "load account messages,\nnewest-first (date DESC)", h=1.1)
    decision(ax, cx, 8.3, "next\nmessage?")
    decision(ax, cx, 5.9, "Bloom contains\nALL terms?\n(k=4 bit tests)")
    decision(ax, cx, 3.4, "every term in\ntokens(subject +\nbody_plain)?")
    process(ax, cx, 1.2, "append to results", w=3.4, h=0.9)
    process(ax, 11.6, 8.3, "return { messages:\nverified matches newest-first,\ntooGeneric: false }", w=4.4, h=1.5, fill=TERMINAL)

    edge(ax, cx, 15.1, cx, 14.85)
    edge(ax, cx, 13.35, cx, 12.85)
    edge(ax, 7.25, 12.1, 9.45, 12.1)
    ax.text(7.35, 12.28, "no — too generic,\nfail fast", ha="left", va="bottom",
            fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 11.35, cx, 10.85, label="yes")
    edge(ax, cx, 9.75, cx, 9.05)
    edge(ax, 7.25, 8.3, 9.35, 8.3)
    ax.text(7.45, 8.46, "exhausted", ha="left", va="bottom",
            fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 7.55, cx, 6.65, label="yes")
    edge(ax, cx, 5.15, cx, 4.15, label="yes — candidate")
    edge(ax, cx, 2.65, cx, 1.65, label="yes — verified")

    # Loop-backs: definitely-absent skip and discarded false positive.
    ax.plot([2.8, 1.6, 1.6], [5.9, 5.9, 8.3], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 1.6, 8.3, 2.8, 8.3)
    ax.text(0.85, 5.62, "no — definitely absent, skip\n(never false-negative)",
            ha="left", va="top", fontsize=8.4, color=INK, fontweight="bold")
    ax.plot([2.8, 0.7, 0.7], [3.4, 3.4, 8.3], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 0.7, 8.3, 2.8, 8.3)
    ax.text(0.95, 3.12, "no — Bloom false positive,\ndiscard on verification",
            ha="left", va="top", fontsize=8.4, color=INK, fontweight="bold")
    ax.plot([6.7, 8.6, 8.6, 6.2], [1.2, 1.2, 8.0, 8.0], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 8.6, 8.0, 6.9, 8.15)

    # Legend (identity is carried by labels; fills only group node types).
    lx, ly = 11.0, 15.9
    for dy, (fill, label) in enumerate([(TERMINAL, "entry / result"),
                                        (PROCESS, "processing step"),
                                        (DECISION, "decision")]):
        ax.add_patch(FancyBboxPatch((lx, ly - dy * 0.62), 0.5, 0.34,
                                    boxstyle="round,pad=0.05", linewidth=1.0,
                                    facecolor=fill, edgecolor=LINE))
        ax.text(lx + 0.75, ly - dy * 0.62 + 0.17, label, ha="left", va="center",
                fontsize=8.6, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "store_flow.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
