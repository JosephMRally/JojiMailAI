#!/usr/bin/env python
"""Generate docs/diagrams/provider_sequence.png — sequence diagram for the
MailProvider interface + ProviderRegistry (user-stories/typescript_mail_provider.md):
registration at the composition root, per-account resolution, calls through
the interface only, and the normalized NOT_FOUND error for unknown accounts.

Reproducible: .venv/bin/python docs/diagrams/src/provider_sequence.py
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
SUBJECT_FILL = "#dbeafe"  # the component under spec
PHASE_FILL = "#f8fafc"  # phase band
RETURN = "#64748b"     # dashed return arrows

ACTORS = [
    ("Composition root", "(src/composition.ts —\nthe only place concretes\nare imported)", BOX_FILL),
    ("React UI", "(imports MailProvider\ninterface + registry only)", BOX_FILL),
    ("ProviderRegistry", "(accountId →\nMailProvider map)", SUBJECT_FILL),
    ("MailProvider", "(interface: the one\nmail API surface)", SUBJECT_FILL),
    ("Concrete provider", "(GmailProvider prod,\nFakeProvider tests)", BOX_FILL),
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

    ax.text(0.25, 21.3, "MailProvider + ProviderRegistry — sequence: register, resolve, call the interface",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.25, 20.75, "user-stories/typescript_mail_provider.md · the UI never imports a concrete provider",
            fontsize=9, color=MUTED, ha="left", va="top")

    # Lifelines and participant boxes.
    for (name, sub, fill), x in zip(ACTORS, X):
        ax.plot([x, x], [BOTTOM, TOP - 0.55], color=LINE, linewidth=1.0,
                linestyle=(0, (5, 4)), zorder=0)
        box(ax, x, TOP, 2.15, 0.95, fill)
        ax.text(x, TOP + 0.16, name, ha="center", va="center",
                fontsize=9.6, color=INK, fontweight="bold")
        ax.text(x, TOP - 0.68, sub, ha="center", va="top", fontsize=7.2, color=MUTED)

    root, ui, reg, iface, conc = X

    # Phase 1: registration at the composition root.
    phase(ax, 18.0, 15.4, "startup — accounts registered once at the composition root")
    arrow(ax, 17.0, root, conc, "new GmailProvider(...) / new FakeProvider(...) — construction does no I/O")
    arrow(ax, 16.3, root, reg, 'register("alice@example.com", provider)')
    self_call(ax, 15.9, reg, "providers.set(accountId, provider)")

    # Phase 2: resolution and interface calls.
    phase(ax, 14.7, 8.6, "any mail flow — resolve per account, then talk to the interface only")
    arrow(ax, 13.7, ui, reg, 'resolve("alice@example.com")')
    arrow(ax, 13.05, reg, ui, "the registered MailProvider (typed as the interface)", dashed=True)
    arrow(ax, 12.3, ui, iface, "listThreads(tagId, { pageToken?, pageSize? })")
    arrow(ax, 11.65, iface, conc, "same call — dynamic dispatch to the concrete proxy")
    arrow(ax, 10.95, conc, iface, "ThreadPage { threads, nextPageToken? } (opaque token)", dashed=True)
    arrow(ax, 10.3, iface, ui, "model types only: Tag, ThreadSummary, Message, Draft", dashed=True)
    self_call(ax, 9.75, ui, "listAccounts() → registered accountIds, registration order")

    # Phase 3: unknown account.
    phase(ax, 7.9, 4.6, "unknown account — one normalized error type")
    arrow(ax, 6.9, ui, reg, 'resolve("nobody@example.com")')
    self_call(ax, 6.45, reg, "no entry for accountId")
    arrow(ax, 5.5, reg, ui, 'throws MailProviderError("NOT_FOUND", "No provider registered …")', dashed=True)

    # Footer note.
    ax.text(0.45, 3.9, "Every failure anywhere in the stack surfaces as MailProviderError\n"
                       "{ code: AUTH_REQUIRED | NETWORK | NOT_FOUND | RATE_LIMITED | PROVIDER_ERROR, message } —\n"
                       "the UI keys its copy off `code` and never learns platform internals.",
            ha="left", va="top", fontsize=8.6, color=MUTED)

    out = Path(__file__).resolve().parent.parent / "provider_sequence.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
