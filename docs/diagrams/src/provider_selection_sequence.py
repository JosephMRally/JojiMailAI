#!/usr/bin/env python
"""Generate docs/diagrams/provider_selection_sequence.png — sequence diagram for
build-time provider selection (user-stories/typescript_email_ui.md): the build
validates --provider and compiles with `vite build --mode <id>`, Vite inlines
import.meta.env.MODE into a literal, the composition root's constant branch folds
so the unselected provider class is tree-shaken out, and exactly one provider is
registered — 1:1 with --provider.

Reproducible: .venv/bin/python docs/diagrams/src/provider_selection_sequence.py
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
SUBJECT_FILL = "#dbeafe"  # the component under spec
PHASE_FILL = "#f8fafc"  # phase band
RETURN = "#64748b"     # dashed return arrows

ACTORS = [
    ("npm run build", "(-- --provider=<id>)", BOX_FILL),
    ("runBuild.mjs", "(providerFlag →\ntsc -b → vite build)", BOX_FILL),
    ("Vite build", "(inlines MODE,\ntree-shakes dead code)", BOX_FILL),
    ("Composition root", "(src/composition.ts —\nthe selection branch)", SUBJECT_FILL),
    ("ProviderRegistry", "(one provider\nregistered)", BOX_FILL),
]
X = [1.5, 4.3, 7.1, 9.9, 12.7]
TOP, BOTTOM = 19.7, 8.0


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
            fontsize=8.2, color=MUTED if dashed else INK)


def self_call(ax, y, x, label):
    ax.plot([x, x + 0.55, x + 0.55, x], [y, y, y - 0.42, y - 0.42],
            color=INK, linewidth=1.2)
    ax.annotate("", xy=(x + 0.02, y - 0.42), xytext=(x + 0.3, y - 0.42),
                arrowprops=dict(arrowstyle="-|>", color=INK, linewidth=1.2))
    ax.text(x + 0.72, y - 0.21, label, ha="left", va="center",
            fontsize=8.2, color=INK)


def phase(ax, y_top, y_bot, title):
    ax.add_patch(FancyBboxPatch((0.25, y_bot), 13.6, y_top - y_bot,
                                boxstyle="round,pad=0.05", linewidth=1.0,
                                facecolor=PHASE_FILL, edgecolor=LINE, zorder=0))
    ax.text(0.45, y_top - 0.14, title, ha="left", va="top",
            fontsize=9.5, color=INK, fontweight="bold", zorder=1)


def main() -> None:
    fig, ax = plt.subplots(figsize=(14.2, 8.4))
    ax.set_xlim(0, 14.2)
    ax.set_ylim(6.9, 21.7)
    ax.axis("off")

    ax.text(0.25, 21.4, "Provider selection — sequence: validate --provider, fold the constant, register one class",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.25, 20.85, "user-stories/typescript_email_ui.md · import.meta.env.MODE inlined at build time · --provider=<id> is 1:1 with the bundled provider class",
            fontsize=8.8, color=MUTED, ha="left", va="top")

    for (name, sub, fill), x in zip(ACTORS, X):
        ax.plot([x, x], [BOTTOM, TOP - 0.55], color=LINE, linewidth=1.0,
                linestyle=(0, (5, 4)), zorder=0)
        box(ax, x, TOP, 2.35, 0.95, fill)
        ax.text(x, TOP + 0.16, name, ha="center", va="center",
                fontsize=9.4, color=INK, fontweight="bold")
        ax.text(x, TOP - 0.68, sub, ha="center", va="top", fontsize=7.0, color=MUTED)

    build, run, vite, root, reg = X

    # Phase 1: validate the flag, hand off to Vite.
    phase(ax, 18.2, 15.5, "build — validate the flag, then compile with the chosen id")
    arrow(ax, 17.3, build, run, "runBuild(['--provider=<id>'])")
    self_call(ax, 16.75, run, "resolveProviderFlag — missing/unknown throws before any compile")
    arrow(ax, 15.85, run, vite, "vite build --mode <id> (Vite's MODE carries the choice)")

    # Phase 2: fold the constant, register one class.
    phase(ax, 15.0, 8.5, "bundle — fold the inlined constant, register exactly one class")
    self_call(ax, 14.1, vite, "inline import.meta.env.MODE → \"<id>\" (a literal)")
    arrow(ax, 13.15, vite, root, "compile src/composition.ts with the literal in place")
    self_call(ax, 12.6, root, "branch folds: MODE 'vite' → FakeProvider, else GmailProvider")
    self_call(ax, 11.5, root, "dead branch → its provider class tree-shaken out")
    arrow(ax, 10.55, root, reg, "register('<id>', new <Selected>Provider(...)) — the only registration")
    arrow(ax, 9.85, reg, root, "registry holds exactly one provider", dashed=True)
    arrow(ax, 9.05, vite, run, "bundle emitted: one provider class, 1:1 with --provider", dashed=True)

    ax.text(0.45, 7.5,
            "The build records .dev-provider, so `npm run dev` reuses the last-built provider (else gmail); an explicit --provider wins.\n"
            "`npm run build -- --provider=vite && npm run dev` serves the demo. In vitest both classes are present; tests pick the branch with vi.stubEnv('MODE').",
            ha="left", va="top", fontsize=8.4, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "provider_selection_sequence.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
