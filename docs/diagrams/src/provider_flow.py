#!/usr/bin/env python
"""Generate docs/diagrams/provider_flow.png — flow diagram for the
MailProvider layer (user-stories/typescript_mail_provider.md): how a UI mail
action flows through registry resolution and the interface, and how every
platform failure is normalized into one MailProviderError code.

Reproducible: .venv/bin/python docs/diagrams/src/provider_flow.py
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
    fig, ax = plt.subplots(figsize=(11.4, 12.6))
    ax.set_xlim(0, 15)
    ax.set_ylim(0, 17.4)
    ax.axis("off")

    ax.text(0.3, 17.1, "MailProvider layer — flow: resolve from the registry, call the interface, normalize errors",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.3, 16.55, "user-stories/typescript_mail_provider.md · tags not folders · opaque page tokens · one error type",
            fontsize=9, color=MUTED, ha="left", va="top")

    cx = 5.0
    process(ax, cx, 15.5, "UI mail action for an account\n(list, read, send, tag, archive…)", h=1.2, fill=TERMINAL)
    process(ax, cx, 13.9, "ProviderRegistry.resolve(accountId)", h=1.0)
    decision(ax, cx, 12.1, "provider\nregistered?")
    process(ax, 11.6, 12.1, "throw MailProviderError\n('NOT_FOUND', …)", w=4.4, h=1.2, fill=TERMINAL)
    process(ax, cx, 10.3, "call the MailProvider interface method\n(capabilities · listTags · listThreads · getThread ·\ngetMessage · send · mark* · add/removeTag · archive · trash)", w=6.4, h=1.5)
    process(ax, cx, 8.35, "concrete proxy does the platform work\n(GmailProvider → localhost bridge; FakeProvider → memory);\nfolders presented as tags, page tokens stay opaque", w=6.4, h=1.4)
    decision(ax, cx, 6.3, "platform\ncall failed?")
    process(ax, 11.6, 6.3, "map to MailProviderError\ncode: AUTH_REQUIRED | NETWORK |\nNOT_FOUND | RATE_LIMITED |\nPROVIDER_ERROR", w=4.9, h=1.7)
    process(ax, 11.6, 3.9, "UI keys copy off `code`;\nplatform internals never leak", w=4.9, h=1.1, fill=TERMINAL)
    process(ax, cx, 3.9, "map platform data to the shared model\n(Tag · ThreadSummary · Message — camelCase)", w=6.0, h=1.1)
    process(ax, cx, 2.1, "resolve with model types only", w=4.6, h=0.9, fill=TERMINAL)

    edge(ax, cx, 14.9, cx, 14.4)
    edge(ax, cx, 13.4, cx, 12.85)
    edge(ax, 7.2, 12.1, 9.35, 12.1)
    ax.text(7.35, 12.28, "no", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 11.35, cx, 11.05, label="yes")
    edge(ax, cx, 9.55, cx, 9.05)
    edge(ax, cx, 7.65, cx, 7.05)
    edge(ax, 7.2, 6.3, 9.1, 6.3)
    ax.text(7.3, 6.48, "yes — normalize", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, 11.6, 5.45, 11.6, 4.45, label="throw")
    edge(ax, cx, 5.55, cx, 4.45, label="no")
    edge(ax, cx, 3.35, cx, 2.55)

    # Legend.
    lx, ly = 11.0, 15.9
    for dy, (fill, label) in enumerate([(TERMINAL, "entry / result"),
                                        (PROCESS, "processing step"),
                                        (DECISION, "decision")]):
        ax.add_patch(FancyBboxPatch((lx, ly - dy * 0.62), 0.5, 0.34,
                                    boxstyle="round,pad=0.05", linewidth=1.0,
                                    facecolor=fill, edgecolor=LINE))
        ax.text(lx + 0.75, ly - dy * 0.62 + 0.17, label, ha="left", va="center",
                fontsize=8.6, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "provider_flow.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
