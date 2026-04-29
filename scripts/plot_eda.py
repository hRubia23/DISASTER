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
    if "text" not in df.columns or "target" not in df.columns:
        raise SystemExit("Dataset must contain columns: text, target")

    df["text"] = df["text"].astype(str)
    df["target"] = pd.to_numeric(df["target"], errors="coerce")

    # Class distribution
    counts = df["target"].value_counts(dropna=False).sort_index()
    plt.figure(figsize=(6, 4))
    plt.title("Class distribution (target)")
    plt.bar([str(i) for i in counts.index], counts.values, color=["#9aa3af", "#d1292d"])
    plt.xlabel("target")
    plt.ylabel("count")
    plt.tight_layout()
    out1 = OUTPUT_DIR / "class_distribution.png"
    plt.savefig(out1, dpi=160)
    plt.close()

    # Tweet length distribution
    lengths = df["text"].str.len()
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

