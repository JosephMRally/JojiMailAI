#!/usr/bin/env python
"""Generate docs/diagrams/plugins_flow.png — flow diagram for one PluginHost
dispatch call (user-stories/typescript_plugin_system.md): structural
capability negotiation, the try/catch + 2-second-timeout isolation around
every hook, session auto-disable on failure, and the attributable merge.

Reproducible: .venv/bin/python docs/diagrams/src/plugins_flow.py
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

    ax.text(0.3, 17.1, "PluginHost dispatch — flow: capability check → isolated hook call → attributable merge",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.3, 16.55, "user-stories/typescript_plugin_system.md · one broken plug-in never breaks a core mail flow",
            fontsize=9, color=MUTED, ha="left", va="top")

    cx = 5.0
    process(ax, cx, 15.6, "dispatch<point>(payload)\ne.g. dispatchMessageView(message)", w=6.2, h=1.1, fill=TERMINAL)
    decision(ax, cx, 13.9, "next registered\nplug-in?\n(registration order)", w=4.6, h=1.7)
    process(ax, 11.6, 13.9, "return results merged in\nregistration order (composeAction:\nfinal Draft — send stays a user act)",
            w=4.6, h=1.6, fill=TERMINAL)
    decision(ax, cx, 11.4, "enabled · not session-\ndisabled · declares the\npoint · has the hook?", w=5.6, h=1.7)
    process(ax, cx, 9.3, "call the hook inside try/catch,\nracing a 2 s timeout (Promise.race)", h=1.2)
    decision(ax, cx, 7.2, "threw, rejected,\nor timed out?", w=4.6, h=1.6)
    process(ax, 10.9, 7.2, "crash isolation: auto-disable\nfor the session; record an error\nnaming the plug-in (via list())",
            w=5.2, h=1.8)
    process(ax, cx, 4.9, "stamp pluginId on every contribution;\ncomposeAction: result feeds the next\ntransform in the chain",
            w=5.6, h=1.5)

    # Main path.
    edge(ax, cx, 15.05, cx, 14.75)
    edge(ax, 7.3, 13.9, 9.3, 13.9)
    ax.text(7.4, 14.08, "exhausted", ha="left", va="bottom",
            fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 13.05, cx, 12.25, label="yes")
    edge(ax, cx, 10.55, cx, 9.9, label="yes — dispatch it")
    edge(ax, cx, 8.7, cx, 8.0)
    edge(ax, 7.3, 7.2, 8.3, 7.2)
    ax.text(7.35, 7.38, "yes", ha="left", va="bottom",
            fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 6.4, cx, 5.65, label="no — contribution kept")

    # Loop-backs to "next plug-in?".
    ax.plot([2.2, 1.4, 1.4], [11.4, 11.4, 13.9], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 1.4, 13.9, 2.7, 13.9)
    ax.text(0.75, 10.95, "no — skipped, never called\n(capability negotiation\nis structural)",
            ha="left", va="top", fontsize=8.4, color=INK, fontweight="bold")
    ax.plot([2.2, 0.6, 0.6], [4.9, 4.9, 13.9], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 0.6, 13.9, 2.7, 13.9)
    ax.text(0.35, 4.4, "merged — continue with\nthe next plug-in",
            ha="left", va="top", fontsize=8.4, color=INK, fontweight="bold")
    ax.plot([10.9, 10.9], [8.1, 12.7], color=MUTED, linewidth=1.2, zorder=0)
    edge(ax, 10.9, 12.7, 7.2, 13.55)
    ax.text(11.1, 9.6, "flow continues —\nother plug-ins and the\ncore app are unharmed",
            ha="left", va="top", fontsize=8.4, color=INK, fontweight="bold")

    # Note: what failure means for each point.
    process(ax, 11.5, 3.6, "on failure the point degrades, never breaks:\nmessageView/threadAction/settingsPanel →\ncontribution omitted · composeAction →\ndraft passes through unchanged",
            w=6.4, h=2.0, fill=NOTE)

    # Legend (identity is carried by labels; fills only group node types).
    lx, ly = 11.0, 16.35
    for dy, (fill, label) in enumerate([(TERMINAL, "entry / result"),
                                        (PROCESS, "processing step"),
                                        (DECISION, "decision")]):
        ax.add_patch(FancyBboxPatch((lx, ly - dy * 0.62), 0.5, 0.34,
                                    boxstyle="round,pad=0.05", linewidth=1.0,
                                    facecolor=fill, edgecolor=LINE))
        ax.text(lx + 0.75, ly - dy * 0.62 + 0.17, label, ha="left", va="center",
                fontsize=8.6, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "plugins_flow.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
