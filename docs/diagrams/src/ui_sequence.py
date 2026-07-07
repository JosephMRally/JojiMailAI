#!/usr/bin/env python
"""Generate docs/diagrams/ui_sequence.png — sequence diagram for the UI
(user-stories/typescript_email_ui.md): startup reads through the four
interfaces resolved at the composition root, manual refresh syncs the
provider page into the MailStore with AI classify-on-arrival, and opening a
thread reads the store, marks read, and loads the async AI digest plus
plug-in panels — errors degrading by code, never blocking mail.

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
    ("MailIntelligence", "(self-hosted AI; failures\ndegrade, never block)", BOX_FILL),
    ("PluginHost", "(crash-isolated typed\nextension points)", BOX_FILL),
]
X = [1.4, 4.2, 6.9, 9.6, 12.1]
TOP, BOTTOM = 21.6, 1.7


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
    ax.add_patch(FancyBboxPatch((0.25, y_bot), 12.6, y_top - y_bot,
                                boxstyle="round,pad=0.05", linewidth=1.0,
                                facecolor=PHASE_FILL, edgecolor=LINE, zorder=0))
    ax.text(0.45, y_top - 0.14, title, ha="left", va="top",
            fontsize=9.5, color=INK, fontweight="bold", zorder=1)


def main() -> None:
    fig, ax = plt.subplots(figsize=(13.2, 10.6))
    ax.set_xlim(0, 13.4)
    ax.set_ylim(1.3, 23.7)
    ax.axis("off")

    ax.text(0.25, 23.4, "React UI — sequence: store-first reads, provider refresh, AI triage, plug-in panels",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.25, 22.85, "user-stories/typescript_email_ui.md · in tests every participant is an in-memory fake",
            fontsize=9, color=MUTED, ha="left", va="top")

    # Lifelines and participant boxes.
    for (name, sub, fill), x in zip(ACTORS, X):
        ax.plot([x, x], [BOTTOM, TOP - 0.55], color=LINE, linewidth=1.0,
                linestyle=(0, (5, 4)), zorder=0)
        box(ax, x, TOP, 2.3, 0.95, fill)
        ax.text(x, TOP + 0.16, name, ha="center", va="center",
                fontsize=9.6, color=INK, fontweight="bold")
        ax.text(x, TOP - 0.68, sub, ha="center", va="top", fontsize=7.2, color=MUTED)

    ui, provider, store, intel, host = X

    # Phase 1: account selected — sidebar + offline-first list.
    phase(ax, 20.1, 16.6, "account selected — sidebar from the provider, thread list from the store (works offline)")
    arrow(ax, 19.2, ui, provider, "listTags() · capabilities()")
    arrow(ax, 18.6, provider, ui, "tags for the sidebar · caps gate compose/archive/tag UI", dashed=True)
    arrow(ax, 17.9, ui, store, "listThreads(accountId, tagId)")
    arrow(ax, 17.3, store, ui, "synced rows — 'no messages' when empty", dashed=True)

    # Phase 2: manual refresh.
    phase(ax, 16.1, 8.3, "Refresh — provider page upserted into the store; new threads AI-classified")
    arrow(ax, 15.2, ui, provider, "listThreads(tagId, { pageSize, pageToken? })")
    arrow(ax, 14.6, provider, ui, "MailProviderError → AUTH_REQUIRED shows its message · NETWORK offers Retry",
          dashed=True)
    arrow(ax, 13.9, ui, store, "upsertThreads(page.threads)")
    arrow(ax, 13.3, ui, provider, "getThread(threadId) per thread")
    arrow(ax, 12.7, ui, store, "upsertMessages(messages)")
    arrow(ax, 12.0, ui, intel, "classify(newest, tags) — threads new to the app only")
    arrow(ax, 11.4, intel, ui, "{ tagIds, importance } — reject → status notice, list still renders", dashed=True)
    arrow(ax, 10.7, ui, provider, "addTag(messageId, tagId) → distinct 'AI' chips + one-tap undo")
    arrow(ax, 10.0, ui, store, "listThreads(accountId, tagId) — re-read")
    self_call(ax, 9.4, ui, "order by AI importance (high→low), toggle to date · Load more iff nextPageToken")

    # Phase 3: thread open.
    phase(ax, 8.0, 2.0, "thread opened — oldest-first from the store, async digest, plug-in panels")
    arrow(ax, 7.1, ui, store, "getThread(threadId) → messages oldest-first")
    arrow(ax, 6.5, ui, provider, "markRead(messageId) for each unread message")
    arrow(ax, 5.8, ui, intel, "summarizeThread(messages) — only when > 3 messages, async")
    arrow(ax, 5.2, intel, ui, "digest panel (summary + action items) · reject → error copy + Retry", dashed=True)
    arrow(ax, 4.5, ui, host, "dispatchMessageView(message) per message")
    arrow(ax, 3.9, host, ui, "ViewContribution[] rendered above the message, attributed", dashed=True)
    self_call(ax, 3.3, ui, "HTML → sandboxed script-less iframe, remote images stripped until 'Load images'")
    self_call(ax, 2.6, ui, "no HTML → bodyPlain fallback · Reply prefills to + single 'Re:'")

    out = Path(__file__).resolve().parent.parent / "ui_sequence.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
