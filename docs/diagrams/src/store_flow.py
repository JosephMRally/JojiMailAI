#!/usr/bin/env python
"""Generate docs/diagrams/store_flow.png — flow diagram for MailStore
searchText (user-stories/typescript_mail_store.md): shared tokenization,
the too-generic fast path, and per-message verification against the stored
subject + body_plain so results equal a full scan (exact — never a missed
or phantom match): the query is matched directly against each message's
stored text.

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

    ax.text(0.3, 17.1, "MailStore.searchText — flow: tokenize → scan stored messages → verify",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.3, 16.55, "user-stories/typescript_mail_store.md · exact: identical to a full scan of stored text, never a missed or phantom result",
            fontsize=9, color=MUTED, ha="left", va="top")

    cx = 5.0
    process(ax, cx, 15.6, "searchText(accountId, terms)", fill=TERMINAL)
    process(ax, cx, 13.95, "tokenize(terms) — shared tokenize.ts:\nlowercase · split on non-alphanumeric runs\ndrop <2-char tokens & ~175 stop words · dedupe", h=1.5)
    decision(ax, cx, 11.7, "query tokens empty?\n(all stop words /\ntoo short)")
    process(ax, 11.6, 11.7, "return { messages: [],\ntooGeneric: true }", w=4.2, h=1.2, fill=TERMINAL)
    process(ax, cx, 9.7, "load the account's messages,\nnewest-first (date DESC)", h=1.1)
    decision(ax, cx, 7.7, "next\nmessage?")
    decision(ax, cx, 4.9, "messageTokens(subject,\nbody_plain) contains\nALL query tokens?", w=4.8, h=1.9)
    process(ax, cx, 2.4, "collect message\ninto matches", w=3.8, h=0.9)
    process(ax, 11.6, 7.7, "return { messages: verified\nmatches (newest-first),\ntooGeneric: false } — exact", w=4.6, h=1.6, fill=TERMINAL)

    edge(ax, cx, 15.1, cx, 14.7)
    edge(ax, cx, 13.2, cx, 12.45)
    edge(ax, 7.25, 11.7, 9.45, 11.7)
    ax.text(7.35, 11.9, "yes — too generic,\nfail fast", ha="left", va="bottom",
            fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 10.95, cx, 10.25, label="no")
    edge(ax, cx, 9.15, cx, 8.45)
    edge(ax, 7.25, 7.7, 9.25, 7.7)
    ax.text(7.4, 7.88, "exhausted", ha="left", va="bottom",
            fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 6.95, cx, 5.85, label="yes")
    edge(ax, cx, 3.95, cx, 2.85, label="yes — collect")

    # Loop-backs: a non-matching message is skipped, a collected one continues;
    # both return to the "next message?" iterator (the for-each over the account).
    ax.plot([2.6, 1.5, 1.5], [4.9, 4.9, 7.7], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 1.5, 7.7, 2.8, 7.7)
    ax.text(0.7, 4.62, "no — not all tokens,\nskip this message",
            ha="left", va="top", fontsize=8.4, color=INK, fontweight="bold")
    ax.plot([6.9, 8.7, 8.7, 6.4], [2.4, 2.4, 7.4, 7.4], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 8.7, 7.4, 6.55, 7.5)
    ax.text(8.85, 4.9, "continue the scan", ha="left", va="center",
            fontsize=8.4, color=INK, fontweight="bold", rotation=90)

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
