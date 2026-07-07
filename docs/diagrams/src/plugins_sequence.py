#!/usr/bin/env python
"""Generate docs/diagrams/plugins_sequence.png — sequence diagram for the
plug-in system (user-stories/typescript_plugin_system.md): versioned
register with persisted enabled state, crash-isolated dispatchMessageView
across a throwing and a healthy plug-in, and list() surfacing the failure.

Reproducible: .venv/bin/python docs/diagrams/src/plugins_sequence.py
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

INK = "#0f172a"        # primary text
MUTED = "#475569"      # secondary text
LINE = "#94a3b8"       # lifelines / recessive strokes
BOX_FILL = "#e2e8f0"   # participant boxes (neutral)
HOST_FILL = "#dbeafe"  # the component under spec
PHASE_FILL = "#f8fafc" # phase band
RETURN = "#64748b"     # dashed return arrows

ACTORS = [
    ("React UI", "(imports MailPlugin types\n+ PluginHost only)", BOX_FILL),
    ("PluginHost", "(PLUGIN_API_VERSION = 1,\ncrash-isolated dispatch)", HOST_FILL),
    ("PluginSettings", "(injected KV: in-memory in tests,\nlocalStorage adapter in prod)", BOX_FILL),
    ("'grenade'", "(ThrowingPlugin fixture,\ndeclares messageView)", BOX_FILL),
    ("'steady'", "(FakePlugin,\ndeclares messageView)", BOX_FILL),
]
X = [1.3, 4.1, 6.7, 9.0, 11.6]
TOP, BOTTOM = 19.6, 1.9


def box(ax, x, y, w, h, fill, edge=LINE):
    ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h,
                                boxstyle="round,pad=0.08", linewidth=1.1,
                                facecolor=fill, edgecolor=edge))


def arrow(ax, y, x1, x2, label, dashed=False, label_dy=0.16):
    color = RETURN if dashed else INK
    ax.annotate("", xy=(x2, y), xytext=(x1, y),
                arrowprops=dict(arrowstyle="-|>", color=color, linewidth=1.2,
                                linestyle=(0, (4, 3)) if dashed else "solid",
                                shrinkA=2, shrinkB=2))
    ax.text((x1 + x2) / 2, y + label_dy, label, ha="center", va="bottom",
            fontsize=8.4, color=MUTED if dashed else INK)


def self_call(ax, y, x, label):
    ax.plot([x, x + 0.55, x + 0.55, x], [y, y, y - 0.42, y - 0.42],
            color=INK, linewidth=1.2)
    ax.annotate("", xy=(x + 0.02, y - 0.42), xytext=(x + 0.3, y - 0.42),
                arrowprops=dict(arrowstyle="-|>", color=INK, linewidth=1.2))
    ax.text(x + 0.72, y - 0.21, label, ha="left", va="center",
            fontsize=8.4, color=INK)


def phase(ax, y_top, y_bot, title):
    ax.add_patch(FancyBboxPatch((0.25, y_bot), 12.1, y_top - y_bot,
                                boxstyle="round,pad=0.05", linewidth=1.0,
                                facecolor=PHASE_FILL, edgecolor=LINE, zorder=0))
    ax.text(0.45, y_top - 0.14, title, ha="left", va="top",
            fontsize=9.5, color=INK, fontweight="bold", zorder=1)


def main() -> None:
    fig, ax = plt.subplots(figsize=(12.8, 9.8))
    ax.set_xlim(0, 12.9)
    ax.set_ylim(1.5, 21.6)
    ax.axis("off")

    ax.text(0.25, 21.3, "PluginHost — sequence: versioned register, crash-isolated dispatch, attributable merge",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.25, 20.75, "user-stories/typescript_plugin_system.md · in-process plug-ins, no network",
            fontsize=9, color=MUTED, ha="left", va="top")

    # Lifelines and participant boxes.
    for (name, sub, fill), x in zip(ACTORS, X):
        ax.plot([x, x], [BOTTOM, TOP - 0.55], color=LINE, linewidth=1.0,
                linestyle=(0, (5, 4)), zorder=0)
        box(ax, x, TOP, 2.15, 0.95, fill)
        ax.text(x, TOP + 0.16, name, ha="center", va="center",
                fontsize=9.6, color=INK, fontweight="bold")
        ax.text(x, TOP - 0.68, sub, ha="center", va="top", fontsize=7.2, color=MUTED)

    ui, host, settings, grenade, steady = X

    # Phase 1: registration at the composition root.
    phase(ax, 18.1, 13.6, "register(plugin) at the composition root — versioned API, persisted choices")
    arrow(ax, 17.1, ui, host, "register(grenade); register(steady)")
    self_call(ax, 16.5, host, "apiVersion ≠ 1? → throw naming both versions")
    arrow(ax, 15.55, host, settings, "get('plugin.enabled.steady')")
    arrow(ax, 14.9, settings, host, "null → enabled by default ('false' → stays disabled)", dashed=True)
    self_call(ax, 14.35, host, "setEnabled(id, bool) persists via settings.set(…)")

    # Phase 2: crash-isolated dispatch.
    phase(ax, 13.1, 4.4, "dispatchMessageView(message) — only enabled plug-ins that declare the point")
    arrow(ax, 12.2, ui, host, "dispatchMessageView(message)")
    self_call(ax, 11.6, host, "select enabled plug-ins declaring 'messageView', registration order")
    arrow(ax, 10.6, host, grenade, "messageView(message) — try/catch, raced with a 2 s timeout")
    arrow(ax, 9.95, grenade, host, "throws (or hangs past 2000 ms)", dashed=True)
    self_call(ax, 9.35, host, "catch → auto-disable 'grenade' for this session, record error")
    arrow(ax, 8.35, host, steady, "messageView(message)")
    arrow(ax, 7.7, steady, host, "[{title, bodyText}]", dashed=True)
    self_call(ax, 7.1, host, "stamp pluginId: 'steady' on every contribution")
    self_call(ax, 6.2, host, "(composeAction instead: each transform feeds the next, in order)")
    arrow(ax, 5.2, host, ui, "ViewContribution[] — core flow intact despite the crash", dashed=True)

    # Phase 3: the failure is visible.
    phase(ax, 3.9, 2.0, "list() — the crash is visible, never silent")
    arrow(ax, 3.0, ui, host, "list()")
    arrow(ax, 2.4, host, ui, "[{grenade: enabled:false, error:'…'}, {steady: enabled:true}]",
          dashed=True)

    out = Path(__file__).resolve().parent.parent / "plugins_sequence.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
