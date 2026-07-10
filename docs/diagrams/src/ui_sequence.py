#!/usr/bin/env python
"""Generate docs/diagrams/ui_sequence.png — sequence diagram for the UI
(user-stories/typescript_email_ui.md): startup reads through the three
interfaces resolved at the composition root, manual refresh syncs the provider
page into the MailStore and re-reads the list, opening a thread reads the
store, marks read, and renders plug-in panels, and search runs the store's
exact text search — errors degrading by code, never blocking mail.

Reproducible: .venv/bin/python docs/diagrams/src/ui_sequence.py
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
UI_FILL = "#dbeafe"    # the component under spec
PHASE_FILL = "#f8fafc" # phase band
RETURN = "#64748b"     # dashed return arrows

ACTORS = [
    ("React UI", "(App.tsx — imports interfaces\nonly; wired in composition.ts)", UI_FILL),
    ("MailProvider", "(resolved from the\nProviderRegistry per account)", BOX_FILL),
    ("MailStore", "(on-device SQLite;\nevery list/read comes from here)", BOX_FILL),
    ("PluginHost", "(crash-isolated typed\nextension points)", BOX_FILL),
]
X = [1.5, 4.5, 7.5, 10.5]
TOP, BOTTOM = 23.3, 2.3


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
    ax.add_patch(FancyBboxPatch((0.25, y_bot), 12.25, y_top - y_bot,
                                boxstyle="round,pad=0.05", linewidth=1.0,
                                facecolor=PHASE_FILL, edgecolor=LINE, zorder=0))
    ax.text(0.45, y_top - 0.14, title, ha="left", va="top",
            fontsize=9.5, color=INK, fontweight="bold", zorder=1)


def main() -> None:
    fig, ax = plt.subplots(figsize=(13.0, 12.8))
    ax.set_xlim(0, 12.8)
    ax.set_ylim(1.8, 25.4)
    ax.axis("off")

    ax.text(0.25, 25.0, "React UI — sequence: store-first reads, provider refresh, exact search, plug-in panels",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.25, 24.45, "user-stories/typescript_email_ui.md · in tests every participant is an in-memory fake",
            fontsize=9, color=MUTED, ha="left", va="top")

    # Lifelines and participant boxes.
    for (name, sub, fill), x in zip(ACTORS, X):
        ax.plot([x, x], [BOTTOM, TOP - 0.55], color=LINE, linewidth=1.0,
                linestyle=(0, (5, 4)), zorder=0)
        box(ax, x, TOP, 2.3, 0.95, fill)
        ax.text(x, TOP + 0.16, name, ha="center", va="center",
                fontsize=9.6, color=INK, fontweight="bold")
        ax.text(x, TOP - 0.68, sub, ha="center", va="top", fontsize=7.2, color=MUTED)

    ui, provider, store, host = X

    # Phase 1: account selected — sidebar + offline-first list.
    phase(ax, 22.2, 18.5, "account selected — sidebar from the provider, thread list from the store (works offline)")
    arrow(ax, 21.0, ui, provider, "listTags() · capabilities()")
    arrow(ax, 20.4, provider, ui, "tags for the sidebar · caps gate compose/archive/tag UI", dashed=True)
    arrow(ax, 19.7, ui, store, "listThreads(accountId, tagId)")
    arrow(ax, 19.1, store, ui, "synced rows — 'no messages' when empty", dashed=True)

    # Phase 2: manual refresh.
    phase(ax, 18.0, 11.6, "Refresh — provider page upserted into the store, then the list re-read")
    arrow(ax, 16.7, ui, provider, "listThreads(tagId, { pageSize, pageToken? })")
    arrow(ax, 16.1, provider, ui, "MailProviderError → AUTH_REQUIRED shows its message · NETWORK offers Retry",
          dashed=True)
    arrow(ax, 15.4, ui, store, "upsertThreads(page.threads)")
    arrow(ax, 14.8, ui, provider, "getThread(threadId) per thread")
    arrow(ax, 14.2, ui, store, "upsertMessages(messages)")
    arrow(ax, 13.5, ui, store, "listThreads(accountId, tagId) — re-read")
    self_call(ax, 12.8, ui, "render rows (newest-first) · Load more iff nextPageToken")

    # Phase 3: thread open.
    phase(ax, 11.1, 5.6, "thread opened — oldest-first from the store, marked read, plug-in panels")
    arrow(ax, 9.9, ui, store, "getThread(threadId) → messages oldest-first")
    arrow(ax, 9.3, ui, provider, "markRead(messageId) for each unread message")
    arrow(ax, 8.7, ui, host, "dispatchMessageView(message) per message")
    arrow(ax, 8.1, host, ui, "ViewContribution[] rendered above the message, attributed", dashed=True)
    self_call(ax, 7.4, ui, "HTML → sandboxed script-less iframe, remote images stripped until 'Load images'")
    self_call(ax, 6.3, ui, "no HTML → bodyPlain fallback · Reply prefills to + single 'Re:'")

    # Phase 4: search.
    phase(ax, 5.1, 2.3, "Search — the store's exact text search over the account")
    arrow(ax, 4.0, ui, store, "searchText(query) — tokenize + verify stored subject/body")
    arrow(ax, 3.4, store, ui, "matching messages · tooGeneric when all stop words", dashed=True)
    self_call(ax, 2.8, ui, "filter rows to matching threads · empty query restores the list")

    out = Path(__file__).resolve().parent.parent / "ui_sequence.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
