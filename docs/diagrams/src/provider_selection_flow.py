#!/usr/bin/env python
"""Generate docs/diagrams/provider_selection_flow.png — flow diagram for
build-time provider selection (user-stories/typescript_email_ui.md): how
`npm run build -- --provider=<id>` validates the flag, how Vite inlines
VITE_MAIL_PROVIDER into a literal the bundler can fold, and how the composition
root's constant branch tree-shakes every provider class except the selected one
so `--provider=<id>` is 1:1 with the single class that ships.

Reproducible: .venv/bin/python docs/diagrams/src/provider_selection_flow.py
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Polygon

INK = "#0f172a"
MUTED = "#475569"
LINE = "#94a3b8"
PROCESS = "#e2e8f0"   # neutral build step
TERMINAL = "#dbeafe"  # entry / result
DECISION = "#fde68a"  # branch
SHAKEN = "#fee2e2"    # dead code removed from the bundle


def process(ax, x, y, text, w=4.6, h=1.0, fill=PROCESS):
    ax.add_patch(FancyBboxPatch((x - w / 2, y - h / 2), w, h,
                                boxstyle="round,pad=0.1", linewidth=1.1,
                                facecolor=fill, edgecolor=LINE))
    ax.text(x, y, text, ha="center", va="center", fontsize=9, color=INK)


def decision(ax, x, y, text, w=4.6, h=1.6):
    ax.add_patch(Polygon([(x, y + h / 2), (x + w / 2, y), (x, y - h / 2), (x - w / 2, y)],
                         closed=True, linewidth=1.1, facecolor=DECISION, edgecolor=LINE))
    ax.text(x, y, text, ha="center", va="center", fontsize=8.8, color=INK)


def edge(ax, x1, y1, x2, y2, label="", ldx=0.18, ldy=0.08):
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle="-|>", color=MUTED, linewidth=1.2,
                                shrinkA=0, shrinkB=4))
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        ax.text(mx + ldx, my + ldy, label, ha="left", va="bottom",
                fontsize=8.6, color=INK, fontweight="bold")


def main() -> None:
    fig, ax = plt.subplots(figsize=(11.8, 13.4))
    ax.set_xlim(0, 15)
    ax.set_ylim(0, 18)
    ax.axis("off")

    ax.text(0.3, 17.7, "Provider selection — flow: --provider validates, Vite folds the constant, one class ships",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.3, 17.15, "user-stories/typescript_email_ui.md · --provider=<id> is 1:1 with the bundled provider class · no demo/dead provider code rides along",
            fontsize=8.8, color=MUTED, ha="left", va="top")

    cx = 5.0
    process(ax, cx, 16.0, "npm run build -- --provider=<id>", h=1.0, fill=TERMINAL)
    process(ax, cx, 14.4, "scripts/providerFlag.mjs\nresolveProviderFlag(argv)", h=1.1)
    decision(ax, cx, 12.5, "known id?\n(gmail | fake)")
    process(ax, 11.5, 12.5, "throw before any\ncompilation — names the\nflag, lists the known ids",
            w=4.6, h=1.5, fill=TERMINAL)
    process(ax, cx, 10.55, "runBuild → tsc -b, then vite build\n(env VITE_MAIL_PROVIDER=<id> wins over .env.local;\n.env.local rewritten so the next npm run dev matches)",
            w=6.8, h=1.5)
    process(ax, cx, 8.7, "Vite replaces import.meta.env.VITE_MAIL_PROVIDER\nwith the literal \"<id>\" at build time",
            w=6.8, h=1.1)
    decision(ax, cx, 6.8, "composition root branch\nselected === 'fake' ?", w=5.0, h=1.6)

    fake_x, gmail_x = 2.7, 8.0
    process(ax, fake_x, 4.7, "register FakeProvider;\nGmailProvider branch is dead →\ntree-shaken from the bundle",
            w=4.9, h=1.5, fill=SHAKEN)
    process(ax, gmail_x, 4.7, "register GmailProvider;\nFakeProvider branch is dead →\ntree-shaken from the bundle",
            w=4.9, h=1.5, fill=SHAKEN)
    process(ax, cx, 2.5, "bundle ships exactly one provider class\n— 1:1 with --provider",
            w=7.4, h=1.1, fill=TERMINAL)

    edge(ax, cx, 15.5, cx, 14.95)
    edge(ax, cx, 13.85, cx, 13.3)
    edge(ax, 7.3, 12.5, 9.2, 12.5)
    ax.text(7.45, 12.68, "no", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 11.7, cx, 11.3, label="yes")
    edge(ax, cx, 9.8, cx, 9.25)
    edge(ax, cx, 8.15, cx, 7.6)
    edge(ax, 4.0, 6.35, 2.9, 5.45, label="yes", ldx=-0.9, ldy=0.0)
    edge(ax, 6.0, 6.35, 7.7, 5.45, label="no", ldx=0.2, ldy=0.0)
    edge(ax, fake_x, 3.95, 4.2, 3.1)
    edge(ax, gmail_x, 3.95, 6.0, 3.1)

    ax.text(0.3, 1.35,
            "Dev (npm run dev) runs the same branch from .env.local — no folding, but still exactly one provider is registered;\n"
            "an unknown value here throws at startup. A build never reaches that throw: resolveProviderFlag already rejected the flag.",
            ha="left", va="top", fontsize=8.4, color=MUTED)

    # Legend.
    lx, ly = 11.2, 16.2
    for dy, (fill, label) in enumerate([(TERMINAL, "entry / result"),
                                        (PROCESS, "build step"),
                                        (DECISION, "decision"),
                                        (SHAKEN, "dead code removed")]):
        ax.add_patch(FancyBboxPatch((lx, ly - dy * 0.62), 0.5, 0.34,
                                    boxstyle="round,pad=0.05", linewidth=1.0,
                                    facecolor=fill, edgecolor=LINE))
        ax.text(lx + 0.75, ly - dy * 0.62 + 0.17, label, ha="left", va="center",
                fontsize=8.6, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "provider_selection_flow.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
