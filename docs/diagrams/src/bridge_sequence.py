#!/usr/bin/env python
"""Generate docs/diagrams/bridge_sequence.png — sequence diagram for the
Gmail bridge (user-stories/python_gmail_bridge.md): /health with no Gmail
call, the lazily constructed simplegmail client on the first mail request,
a paged GET /threads round-trip, and Gmail-error → wire-error mapping.

Reproducible: .venv/bin/python docs/diagrams/src/bridge_sequence.py
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
    ("GmailProvider", "(app-side proxy —\nHTTP on 127.0.0.1:8765)", BOX_FILL),
    ("bridge/app.py", "(FastAPI facade,\nsnake_case wire schema)", SUBJECT_FILL),
    ("Gmail client", "(simplegmail fork —\nlazy, built once, reused)", BOX_FILL),
    ("Gmail API", "(Google servers —\nonly the bridge talks here)", BOX_FILL),
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

    ax.text(0.25, 21.3, "Gmail bridge — sequence: health, lazy OAuth'd client, paged reads, error mapping",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.25, 20.75, "user-stories/python_gmail_bridge.md · loopback only (127.0.0.1) · all Gmail I/O lives here",
            fontsize=9, color=MUTED, ha="left", va="top")

    for (name, sub, fill), x in zip(ACTORS, X):
        ax.plot([x, x], [BOTTOM, TOP - 0.55], color=LINE, linewidth=1.0,
                linestyle=(0, (5, 4)), zorder=0)
        box(ax, x, TOP, 2.5, 0.95, fill)
        ax.text(x, TOP + 0.16, name, ha="center", va="center",
                fontsize=9.6, color=INK, fontweight="bold")
        ax.text(x, TOP - 0.68, sub, ha="center", va="top", fontsize=7.2, color=MUTED)

    proxy, app, gmail, api = X

    # Phase 1: health.
    phase(ax, 18.1, 16.3, "GET /health — verify the bridge is up without touching Gmail or OAuth")
    arrow(ax, 17.05, proxy, app, "GET /health")
    arrow(ax, 16.5, app, proxy, '200 {"status": "ok"} — no Gmail client constructed', dashed=True)

    # Phase 2: first mail request builds the client lazily.
    phase(ax, 15.7, 11.6, "first mail request — the simplegmail client is built lazily, then reused")
    arrow(ax, 14.45, proxy, app, "GET /threads?tag=INBOX&page_size=25")
    self_call(ax, 14.0, app, "no client yet → gmail_factory(): token / client-secret paths checked")
    self_call(ax, 13.1, app, "neither file exists → 401 {code: AUTH_REQUIRED, message: how to fix}")
    arrow(ax, 12.1, app, gmail, "Gmail(client_secret_file, creds_file) — browser OAuth once, token reused")
    arrow(ax, 11.75, gmail, api, "OAuth handshake / saved token")

    # Phase 3: the read round-trip.
    phase(ax, 10.9, 5.6, "GET /threads — page, hydrate, group, serialize snake_case")
    arrow(ax, 9.65, app, gmail, "service.users().messages().list(labelIds=[tag], maxResults, pageToken)")
    arrow(ax, 9.0, gmail, api, "messages.list")
    arrow(ax, 8.45, api, gmail, "refs + nextPageToken", dashed=True)
    arrow(ax, 7.8, app, gmail, "_get_messages_from_refs(refs) — MIME parsing stays in the fork")
    arrow(ax, 7.2, gmail, app, "simplegmail Message objects", dashed=True)
    self_call(ax, 6.7, app, "group by thread_id → thread summaries (newest wins), date → epoch ms")
    arrow(ax, 5.85, app, proxy, '200 {"threads": […], "next_page_token"?} — token passed through opaquely', dashed=True)

    # Phase 4: errors.
    phase(ax, 4.9, 2.1, "any Gmail failure — one wire error schema {code, message}")
    arrow(ax, 3.7, gmail, app, "HttpError(resp.status) or any exception", dashed=True)
    self_call(ax, 3.25, app, "401→AUTH_REQUIRED · 404→NOT_FOUND · 429→RATE_LIMITED · else→PROVIDER_ERROR(502)")
    arrow(ax, 2.45, app, proxy, "{code, message} with the mapped HTTP status — 422 validation uses it too", dashed=True)

    out = Path(__file__).resolve().parent.parent / "bridge_sequence.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
