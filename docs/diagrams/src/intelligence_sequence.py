#!/usr/bin/env python
"""Generate docs/diagrams/intelligence_sequence.png — sequence diagram for the
MailIntelligence layer (user-stories/typescript_mail_intelligence.md):
classify through the openai SDK against a self-hosted /v1 server with strict
json_schema output, zod re-validation with one retry, invented-tag filtering,
and the transport error mapping (AI_UNAVAILABLE / AI_MODEL_NOT_FOUND).

Reproducible: .venv/bin/python docs/diagrams/src/intelligence_sequence.py
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
    ("React UI", "(via MailIntelligence\ninterface only)", BOX_FILL),
    ("LocalIntelligence", "(concrete — lazy client,\nno I/O at construction)", SUBJECT_FILL),
    ("openai SDK", "(official client —\nnever raw fetch)", BOX_FILL),
    ("Self-hosted LLM", "(Ollama | vLLM | LM Studio\nVITE_AI_BASE_URL /v1)", BOX_FILL),
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

    ax.text(0.25, 21.3, "MailIntelligence — sequence: constrained JSON from a self-hosted model, validated twice",
            fontsize=13, color=INK, fontweight="bold", ha="left", va="top")
    ax.text(0.25, 20.75, "user-stories/typescript_mail_intelligence.md · mail content never leaves the user's machines",
            fontsize=9, color=MUTED, ha="left", va="top")

    for (name, sub, fill), x in zip(ACTORS, X):
        ax.plot([x, x], [BOTTOM, TOP - 0.55], color=LINE, linewidth=1.0,
                linestyle=(0, (5, 4)), zorder=0)
        box(ax, x, TOP, 2.5, 0.95, fill)
        ax.text(x, TOP + 0.16, name, ha="center", va="center",
                fontsize=9.6, color=INK, fontweight="bold")
        ax.text(x, TOP - 0.68, sub, ha="center", va="top", fontsize=7.2, color=MUTED)

    ui, intel, sdk, llm = X

    # Phase 1: classify happy path.
    phase(ax, 18.1, 11.5, "classify(message, availableTags) — auto-tag arriving mail (deterministic: temperature 0)")
    arrow(ax, 16.85, ui, intel, "classify(message, availableTags)")
    self_call(ax, 16.4, intel, "first call → clientFactory(): OpenAI({ baseURL, apiKey: 'not-needed' })")
    self_call(ax, 15.5, intel, "prompt: subject + from + 280-char snippet + tagId/name list (small context)")
    arrow(ax, 14.55, intel, sdk, "chat.completions.create({ model: VITE_AI_MODEL, response_format: json_schema strict })")
    arrow(ax, 14.0, sdk, llm, "POST /v1/chat/completions")
    arrow(ax, 13.4, llm, intel, "choices[0].message.content — JSON constrained by the schema", dashed=True)
    self_call(ax, 12.95, intel, "zod re-validates; invented tagIds filtered against availableTags")
    arrow(ax, 12.1, intel, ui, "{ tagIds ⊆ available, importance: high|normal|low }", dashed=True)
    ax.text(0.45, 11.8, "summarizeThread / draftReply / parseSearchQuery run the same round-trip with their own schemas.",
            ha="left", va="top", fontsize=8.4, color=MUTED)

    # Phase 2: schema-invalid output.
    phase(ax, 10.7, 7.6, "schema-invalid output — one automatic retry, then AI_BAD_OUTPUT")
    arrow(ax, 9.55, llm, intel, "malformed JSON or zod-invalid shape", dashed=True)
    arrow(ax, 8.9, intel, llm, "same request once more (small local models flake)")
    arrow(ax, 8.25, llm, intel, "still invalid → throw MailIntelligenceError('AI_BAD_OUTPUT')", dashed=True)

    # Phase 3: transport errors.
    phase(ax, 6.7, 2.1, "server down / model missing — actionable errors, never retried")
    arrow(ax, 5.5, sdk, intel, "APIConnectionError (refused / timeout)", dashed=True)
    self_call(ax, 5.05, intel, "AI_UNAVAILABLE — names the server kinds and VITE_AI_BASE_URL")
    arrow(ax, 4.15, sdk, intel, "HTTP 404 — model not pulled/loaded", dashed=True)
    self_call(ax, 3.7, intel, "AI_MODEL_NOT_FOUND — names the model, suggests `ollama pull …` / VITE_AI_MODEL")
    arrow(ax, 2.8, intel, ui, "MailIntelligenceError { code, message } — AI degrades, mail flows never block", dashed=True)

    out = Path(__file__).resolve().parent.parent / "intelligence_sequence.png"
    fig.savefig(out, dpi=200, bbox_inches="tight", facecolor="white")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
