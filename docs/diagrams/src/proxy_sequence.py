#!/usr/bin/env python
"""Generate docs/diagrams/proxy_sequence.png — sequence diagram for the
GmailProvider proxy (user-stories/providers/typescript_gmail_proxy.md): lazy
construction, the per-request OAuth token supplier, a read round-trip with
the threads.list + metadata fetch and wire→model mapping, a send with the
RFC 2822 raw body, and the error paths (token rejection → AUTH_REQUIRED,
transport → NETWORK, HTTP status → normalized codes).

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
    ("GmailProvider", "(native proxy —\nsrc/providers/gmail/)", SUBJECT_FILL),
    ("getAccessToken", "(native OAuth supplier\nfrom the composition root)", BOX_FILL),
    ("Gmail REST API", "(gmail.googleapis.com\n/gmail/v1/users/me)", BOX_FILL),
]
X = [1.4, 4.6, 8.0, 11.4]
TOP, BOTTOM = 20.6, 1.9


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
    fig, ax = plt.subplots(figsize=(12.8, 10.4))
    ax.set_xlim(0, 12.6)
    ax.set_ylim(1.5, 22.6)
    ax.axis("off")

    ax.text(0.25, 22.3, "GmailProvider — sequence: a thin native proxy straight to the Gmail REST API",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.25, 21.75, "user-stories/providers/typescript_gmail_proxy.md · no bridge, nothing to install · construction does no I/O · no retry/cache by design (v1)",
            fontsize=9, color=MUTED, ha="left", va="top")

    for (name, sub, fill), x in zip(ACTORS, X):
        ax.plot([x, x], [BOTTOM, TOP - 0.55], color=LINE, linewidth=1.0,
                linestyle=(0, (5, 4)), zorder=0)
        box(ax, x, TOP, 2.5, 0.95, fill)
        ax.text(x, TOP + 0.16, name, ha="center", va="center",
                fontsize=9.6, color=INK, fontweight="bold")
        ax.text(x, TOP - 0.68, sub, ha="center", va="top", fontsize=7.2, color=MUTED)

    ui, proxy, token, gmail = X

    # Phase 1: read with paging + mapping.
    phase(ax, 19.1, 12.4, "listThreads — threads.list + metadata fetch, opaque paging, wire→model mapping")
    arrow(ax, 17.85, ui, proxy, "listThreads(tagId, { pageToken?, pageSize? })")
    arrow(ax, 17.25, proxy, token, "getAccessToken()  (called per request — rotated tokens just work)")
    arrow(ax, 16.85, token, proxy, "Bearer token", dashed=True)
    arrow(ax, 16.25, proxy, gmail, "GET /threads?labelIds=…&pageToken&maxResults  (Authorization: Bearer)")
    arrow(ax, 15.65, gmail, proxy, '200 {"threads": [{id, snippet}], "nextPageToken"?}', dashed=True)
    arrow(ax, 15.05, proxy, gmail, "GET /threads/{id}?format=metadata — per listed thread (headers + labels, no bodies)")
    arrow(ax, 14.45, gmail, proxy, "200 thread metadata", dashed=True)
    self_call(ax, 14.0, proxy, "summary from the newest message: subject/from/snippet/date/tagIds;")
    self_call(ax, 13.35, proxy, "unread = any message carries UNREAD · internalDate string → Number()")
    arrow(ax, 12.45, proxy, ui, "ThreadPage { threads, nextPageToken? } — token never inspected", dashed=True)

    # Phase 2: send.
    phase(ax, 11.8, 8.6, "send(draft) — RFC 2822 raw, base64url-encoded")
    arrow(ax, 10.6, ui, proxy, "send({ to, cc?, bcc?, subject, bodyPlain })")
    self_call(ax, 10.15, proxy, "build RFC 2822 (To/Cc/Bcc/Subject + body) → base64url {raw}")
    arrow(ax, 9.35, proxy, gmail, "POST /messages/send {raw}")
    arrow(ax, 8.85, gmail, proxy, '200 {"id"}  →  resolves { messageId }', dashed=True)

    # Phase 3: errors.
    phase(ax, 8.0, 2.1, "failures — everything becomes MailProviderError, keyed for the UI")
    self_call(ax, 7.3, proxy, 'getAccessToken rejects (not signed in) → AUTH_REQUIRED "Sign in with Google…" — no request made')
    arrow(ax, 6.4, proxy, gmail, "fetch rejects (offline) / body is not JSON")
    self_call(ax, 5.95, proxy, 'throw MailProviderError("NETWORK", "Cannot reach Gmail…")')
    arrow(ax, 5.05, gmail, proxy, 'non-2xx {"error": {message}} mapped by status', dashed=True)
    self_call(ax, 4.6, proxy, "401/403 → AUTH_REQUIRED (+ sign-in guidance) · 404 → NOT_FOUND · 429 → RATE_LIMITED · else PROVIDER_ERROR")
    arrow(ax, 3.7, proxy, ui, "MailProviderError { code, message } — Gmail's error.message preserved", dashed=True)
    ax.text(0.45, 2.95, "Tag changes are the only mutations (modify addLabelIds/removeLabelIds; trash via the dedicated\nendpoint) — the tag model holds end-to-end and nothing is ever permanently deleted.",
            ha="left", va="top", fontsize=8.6, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "proxy_sequence.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
