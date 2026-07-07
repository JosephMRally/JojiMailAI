#!/usr/bin/env python
"""Generate docs/diagrams/store_sequence.png — sequence diagram for the
MailStore component (user-stories/typescript_mail_store.md): upsertMessages
indexing and Bloom-prescreened searchText, both through the shared
tokenize/bloom modules and the thin injected DbHandle.

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
    ("bloom.ts", "(m=2048, k=4,\nFNV-1a x2, K-M)", BOX_FILL),
    ("DbHandle", "(injected: sql.js in tests,\nCapacitor SQLite in prod)", BOX_FILL),
]
X = [1.3, 4.1, 6.7, 9.0, 11.6]
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

    ax.text(0.25, 21.3, "MailStore — sequence: index on upsert, Bloom-prescreened exact search",
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

    ui, store, tok, blm, db = X

    # Phase 1: upsertMessages.
    phase(ax, 18.1, 12.0, "upsertMessages(accountId, messages) — index while writing")
    arrow(ax, 17.1, ui, store, "upsertMessages(accountId, messages)")
    arrow(ax, 16.4, store, tok, "messageTokens(subject, bodyPlain)")
    arrow(ax, 15.75, tok, store, "distinct tokens (lowercased; stop/short words dropped)", dashed=True)
    arrow(ax, 15.1, store, blm, "createBloom(tokens)")
    arrow(ax, 14.45, blm, store, "256-byte filter (2048 bits, k=4)", dashed=True)
    arrow(ax, 13.8, store, db, "run(INSERT … ON CONFLICT(message_id) DO UPDATE …, [row, bloom BLOB])")
    arrow(ax, 13.15, store, db, "run(DELETE + INSERT message_tags rows)")
    arrow(ax, 12.45, store, ui, "resolves — re-sync never duplicates a row", dashed=True)

    # Phase 2: searchText.
    phase(ax, 11.4, 2.2, "searchText(accountId, terms) — prescreen with Bloom, verify for exactness")
    arrow(ax, 10.15, ui, store, "searchText(accountId, terms)")
    arrow(ax, 9.5, store, tok, "tokenize(terms)  — same shared rules as indexing")
    arrow(ax, 8.9, tok, store, "query tokens", dashed=True)
    self_call(ax, 8.3, store, "no tokens left? → { messages: [], tooGeneric: true }")
    arrow(ax, 7.3, store, db, "query(SELECT * FROM messages WHERE account_id = ? ORDER BY date DESC)")
    arrow(ax, 6.65, db, store, "rows incl. bloom BLOBs", dashed=True)
    arrow(ax, 6.0, store, blm, "bloomContainsAll(row.bloom, tokens) per row")
    arrow(ax, 5.35, blm, store, "candidates = rows that may contain ALL terms (never false-negative)", dashed=True)
    self_call(ax, 4.75, store, "verify each candidate: every term ∈ tokens(subject + body_plain)")
    self_call(ax, 3.85, store, "false positives end here — results identical to a full scan")
    arrow(ax, 2.85, store, ui, "{ messages: verified matches newest-first, tooGeneric: false }", dashed=True)

    out = Path(__file__).resolve().parent.parent / "store_sequence.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
