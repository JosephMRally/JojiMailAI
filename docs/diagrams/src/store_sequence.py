#!/usr/bin/env python
"""Generate docs/diagrams/store_sequence.png — sequence diagram for the
MailStore component (user-stories/typescript_mail_store.md): upsertMessages
writes rows, and searchText tokenizes the query, scans the account's messages,
and verifies each against the stored subject + body for exact results — all
through the shared tokenize module and the thin injected DbHandle.

Reproducible: .venv/bin/python docs/diagrams/src/store_sequence.py
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
STORE_FILL = "#dbeafe" # the component under spec
PHASE_FILL = "#f8fafc" # phase band
RETURN = "#64748b"     # dashed return arrows

ACTORS = [
    ("React UI", "(via MailStore\ninterface only)", BOX_FILL),
    ("SqliteMailStore", "(concrete MailStore)", STORE_FILL),
    ("tokenize.ts", "(shared tokenizer\n+ stopwords.ts)", BOX_FILL),
    ("DbHandle", "(injected: sql.js in tests,\nCapacitor SQLite in prod)", BOX_FILL),
]
X = [1.6, 4.9, 8.1, 11.1]
TOP, BOTTOM = 19.6, 4.2


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
    ax.add_patch(FancyBboxPatch((0.25, y_bot), 12.3, y_top - y_bot,
                                boxstyle="round,pad=0.05", linewidth=1.0,
                                facecolor=PHASE_FILL, edgecolor=LINE, zorder=0))
    ax.text(0.45, y_top - 0.14, title, ha="left", va="top",
            fontsize=9.5, color=INK, fontweight="bold", zorder=1)


def main() -> None:
    fig, ax = plt.subplots(figsize=(12.8, 9.8))
    ax.set_xlim(0, 12.8)
    ax.set_ylim(1.5, 21.6)
    ax.axis("off")

    ax.text(0.25, 21.3, "MailStore — sequence: write rows on upsert, exact text search on scan",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.25, 20.75, "user-stories/typescript_mail_store.md · all storage local, no network",
            fontsize=9, color=MUTED, ha="left", va="top")

    # Lifelines and participant boxes.
    for (name, sub, fill), x in zip(ACTORS, X):
        ax.plot([x, x], [BOTTOM, TOP - 0.55], color=LINE, linewidth=1.0,
                linestyle=(0, (5, 4)), zorder=0)
        box(ax, x, TOP, 2.15, 0.95, fill)
        ax.text(x, TOP + 0.16, name, ha="center", va="center",
                fontsize=9.6, color=INK, fontweight="bold")
        ax.text(x, TOP - 0.68, sub, ha="center", va="top", fontsize=7.2, color=MUTED)

    ui, store, tok, db = X

    # Phase 1: upsertMessages — write rows (no separate search index).
    phase(ax, 18.1, 13.4, "upsertMessages(accountId, messages) — write rows, no separate index")
    arrow(ax, 17.1, ui, store, "upsertMessages(accountId, messages)")
    arrow(ax, 16.3, store, db, "run(INSERT … messages(…, body_plain, body_html, unread) ON CONFLICT(message_id) DO UPDATE …, [row])")
    arrow(ax, 15.5, store, db, "run(DELETE message_tags; INSERT one row per tag)")
    arrow(ax, 14.7, store, ui, "resolves — re-sync never duplicates a row", dashed=True)

    # Phase 2: searchText — tokenize, scan, verify.
    phase(ax, 12.8, 4.4, "searchText(accountId, terms) — tokenize, scan the account, verify for exactness")
    arrow(ax, 11.8, ui, store, "searchText(accountId, terms)")
    arrow(ax, 11.05, store, tok, "tokenize(terms) — same shared rules as indexing")
    arrow(ax, 10.35, tok, store, "query tokens (lowercased; stop/short words dropped)", dashed=True)
    self_call(ax, 9.7, store, "no tokens left? → { messages: [], tooGeneric: true }")
    arrow(ax, 8.5, store, db, "query(SELECT * FROM messages WHERE account_id = ? ORDER BY date DESC)")
    arrow(ax, 7.8, db, store, "the account's message rows (newest-first)", dashed=True)
    self_call(ax, 7.2, store, "for each row: query tokens ⊆ tokens(subject + body_plain)?")
    self_call(ax, 6.1, store, "collect matches — exact, identical to a full scan")
    arrow(ax, 5.0, store, ui, "{ messages: verified matches (newest-first), tooGeneric: false }", dashed=True)

    out = Path(__file__).resolve().parent.parent / "store_sequence.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
