#!/usr/bin/env python
"""Generate docs/diagrams/proxy_flow.png — flow diagram for one GmailProvider
round-trip (user-stories/typescript_gmail_proxy.md): request construction,
the two transport failure points that become NETWORK, bridge error rethrow
with the AUTH_REQUIRED guidance, and wire→model mapping on success.

Reproducible: .venv/bin/python docs/diagrams/src/proxy_flow.py
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

    ax.text(0.3, 17.1, "GmailProvider — flow: one bridge round-trip, every exit normalized",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.3, 16.55, "user-stories/typescript_gmail_proxy.md · all Gmail knowledge (URL, wire schema, error mapping) in one directory",
            fontsize=9, color=MUTED, ha="left", va="top")

    cx = 5.0
    process(ax, cx, 15.6, "interface method call\n(capabilities answers statically — no HTTP)", w=5.6, h=1.1, fill=TERMINAL)
    process(ax, cx, 14.0, "build request: method → endpoint,\nencodeURIComponent ids, page_token verbatim,\nmodify actions {action, tag_id?}", w=5.8, h=1.4)
    decision(ax, cx, 12.0, "fetch\nresolved?")
    process(ax, 11.6, 12.0, "MailProviderError('NETWORK',\n'Cannot reach the Gmail bridge\nat {baseUrl}. Is it running?')", w=4.9, h=1.4, fill=TERMINAL)
    decision(ax, cx, 9.9, "body parses\nas JSON?")
    process(ax, 11.6, 9.9, "MailProviderError('NETWORK',\n'non-JSON response (HTTP n)')", w=4.9, h=1.2, fill=TERMINAL)
    decision(ax, cx, 7.8, "HTTP 2xx?")
    process(ax, 11.6, 7.4, "rethrow {code, message}:\nknown code kept, unknown →\nPROVIDER_ERROR; AUTH_REQUIRED\ngains bridge + sign-in guidance", w=4.9, h=1.7, fill=TERMINAL)
    process(ax, cx, 5.7, "map wire → model, field-for-field:\nsnake_case → camelCase · absent optionals stay absent\n(no undefined-valued keys) · epoch-ms dates as-is", w=6.4, h=1.4)
    process(ax, cx, 3.8, "resolve with model types\n(Tag · ThreadPage · Message · SendResult · void)", w=5.6, h=1.1, fill=TERMINAL)

    edge(ax, cx, 15.05, cx, 14.7)
    edge(ax, cx, 13.3, cx, 12.75)
    edge(ax, 7.2, 12.0, 9.1, 12.0)
    ax.text(7.3, 12.18, "no — rejected", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 11.25, cx, 10.65, label="yes")
    edge(ax, 7.2, 9.9, 9.1, 9.9)
    ax.text(7.3, 10.08, "no", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 9.15, cx, 8.55, label="yes")
    edge(ax, 7.2, 7.8, 9.1, 7.6)
    ax.text(7.3, 7.98, "no — bridge error body", ha="left", va="bottom", fontsize=8.6, color=INK, fontweight="bold")
    edge(ax, cx, 7.05, cx, 6.4, label="yes")
    edge(ax, cx, 5.0, cx, 4.35)

    ax.text(0.6, 2.3, "Deliberate v1 omission: no retry, no caching, no offline queue — the proxy stays a thin\nremote surrogate; resilience is a later, separately-tested layer.",
            ha="left", va="top", fontsize=8.6, color=MUTED)

    # Legend.
    lx, ly = 11.0, 15.9
    for dy, (fill, label) in enumerate([(TERMINAL, "entry / exit"),
                                        (PROCESS, "processing step"),
                                        (DECISION, "decision")]):
        ax.add_patch(FancyBboxPatch((lx, ly - dy * 0.62), 0.5, 0.34,
                                    boxstyle="round,pad=0.05", linewidth=1.0,
                                    facecolor=fill, edgecolor=LINE))
        ax.text(lx + 0.75, ly - dy * 0.62 + 0.17, label, ha="left", va="center",
                fontsize=8.6, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "proxy_flow.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
