from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd

BASE_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = BASE_DIR / "datasets" / "disaster_tweets.csv"
OUTPUT_DIR = BASE_DIR / "outputs" / "graphs"


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not DATASET_PATH.exists():
        print(f"[plot_eda] Missing dataset: {DATASET_PATH}")
        print("[plot_eda] Put your CSV in datasets/disaster_tweets.csv then re-run.")
        return 2

    df = pd.read_csv(DATASET_PATH)
    text_col = None
    for candidate in ("text", "tweet_text"):
        if candidate in df.columns:
            text_col = candidate
            break
    if not text_col:
        raise SystemExit("Dataset must contain column: text or tweet_text")

    label_col = None
    for candidate in ("label", "category", "class_label"):
        if candidate in df.columns:
            label_col = candidate
            break
    if not label_col:
        raise SystemExit("Dataset must contain column: label, category, or class_label")

    df[text_col] = df[text_col].astype(str)
    df[label_col] = df[label_col].astype(str)

    # Class distribution
    counts = df[label_col].value_counts(dropna=False).sort_index()
    plt.figure(figsize=(6, 4))
    plt.title("Class distribution (label)")
    plt.bar([str(i) for i in counts.index], counts.values, color="#d1292d")
    plt.xlabel("label")
    plt.ylabel("count")
    plt.tight_layout()
    out1 = OUTPUT_DIR / "class_distribution.png"
    plt.savefig(out1, dpi=160)
    plt.close()

    # Tweet length distribution
    lengths = df[text_col].str.len()
    plt.figure(figsize=(7, 4))
    plt.title("Tweet length distribution")
    plt.hist(lengths.dropna(), bins=50, color="#2b6cb0", alpha=0.85)
    plt.xlabel("characters")
    plt.ylabel("tweets")
    plt.tight_layout()
    out2 = OUTPUT_DIR / "tweet_length_hist.png"
    plt.savefig(out2, dpi=160)
    plt.close()

    print(f"[plot_eda] Saved: {out1}")
    print(f"[plot_eda] Saved: {out2}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

