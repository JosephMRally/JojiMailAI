#!/usr/bin/env python
"""Generate docs/diagrams/proxy_sequence.png — sequence diagram for the
GmailProvider proxy (user-stories/typescript_gmail_proxy.md): lazy
construction, a read round-trip with opaque paging and snake→camel mapping,
a send, and both error paths (transport → NETWORK, bridge {code, message}
rethrown with AUTH_REQUIRED fix instructions).

Reproducible: .venv/bin/python docs/diagrams/src/proxy_sequence.py
"""
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

INK = "#0f172a"
MUTED = "#475569"
LINE = "#94a3b8"
BOX_FILL = "#e2e8f0"
SUBJECT_FILL = "#dbeafe"
PHASE_FILL = "#f8fafc"
RETURN = "#64748b"

ACTORS = [
    ("React UI", "(via MailProvider\ninterface only)", BOX_FILL),
    ("GmailProvider", "(remote proxy —\nsrc/providers/gmail/)", SUBJECT_FILL),
    ("fetch", "(injected in tests;\nglobal fetch in prod)", BOX_FILL),
    ("bridge/app.py", "(127.0.0.1:8765 —\nVITE_BRIDGE_URL)", BOX_FILL),
]
X = [1.4, 4.6, 8.0, 11.4]
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
    ax.set_xlim(0, 12.6)
    ax.set_ylim(1.5, 21.6)
    ax.axis("off")

    ax.text(0.25, 21.3, "GmailProvider — sequence: a thin remote proxy over the localhost bridge",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.25, 20.75, "user-stories/typescript_gmail_proxy.md · construction does no I/O · no retry/cache by design (v1)",
            fontsize=9, color=MUTED, ha="left", va="top")

    for (name, sub, fill), x in zip(ACTORS, X):
        ax.plot([x, x], [BOTTOM, TOP - 0.55], color=LINE, linewidth=1.0,
                linestyle=(0, (5, 4)), zorder=0)
        box(ax, x, TOP, 2.5, 0.95, fill)
        ax.text(x, TOP + 0.16, name, ha="center", va="center",
                fontsize=9.6, color=INK, fontweight="bold")
        ax.text(x, TOP - 0.68, sub, ha="center", va="top", fontsize=7.2, color=MUTED)

    ui, proxy, fetch, bridge = X

    # Phase 1: read with paging + mapping.
    phase(ax, 18.1, 12.9, "listThreads — one endpoint per method, opaque paging, snake→camel mapping")
    arrow(ax, 16.85, ui, proxy, "listThreads(tagId, { pageToken?, pageSize? })")
    self_call(ax, 16.4, proxy, "build query: tag, page_token verbatim, page_size")
    arrow(ax, 15.35, proxy, fetch, "GET {baseUrl}/threads?tag=…")
    arrow(ax, 14.95, fetch, bridge, "HTTP")
    arrow(ax, 14.35, bridge, proxy, '200 {"threads": […], "next_page_token"?}', dashed=True)
    self_call(ax, 13.9, proxy, "map field-for-field: thread_id→threadId, tag_ids→tagIds, date as-is")
    arrow(ax, 12.95, proxy, ui, "ThreadPage { threads, nextPageToken? } — token never inspected", dashed=True)

    # Phase 2: send.
    phase(ax, 12.3, 9.4, "send(draft) — POST /messages/send")
    arrow(ax, 11.1, ui, proxy, "send({ to, cc?, bcc?, subject, bodyPlain })")
    arrow(ax, 10.5, proxy, bridge, "POST /messages/send {to, cc?, bcc?, subject, body_plain}")
    arrow(ax, 9.9, bridge, proxy, '200 {"message_id"}  →  resolves { messageId }', dashed=True)

    # Phase 3: errors.
    phase(ax, 8.5, 2.1, "failures — everything becomes MailProviderError, keyed for the UI")
    arrow(ax, 7.3, proxy, fetch, "fetch rejects (bridge not running) / body is not JSON")
    self_call(ax, 6.85, proxy, 'throw MailProviderError("NETWORK", "Cannot reach the Gmail bridge at …")')
    arrow(ax, 5.95, bridge, proxy, 'non-2xx {code, message} (e.g. 401 AUTH_REQUIRED "token expired")', dashed=True)
    self_call(ax, 5.5, proxy, "rethrow with the same code; unknown codes → PROVIDER_ERROR")
    self_call(ax, 4.6, proxy, 'AUTH_REQUIRED gains "start the bridge, finish Google sign-in in a browser"')
    arrow(ax, 3.7, proxy, ui, "MailProviderError { code, message } — bridge detail preserved", dashed=True)
    ax.text(0.45, 2.95, "The wire schema here and in user-stories/python_gmail_bridge.md agree field-for-field —\nchange them together or not at all.",
            ha="left", va="top", fontsize=8.6, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "proxy_sequence.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
