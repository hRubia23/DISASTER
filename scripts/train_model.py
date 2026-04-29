from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

BASE_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = BASE_DIR / "datasets" / "disaster_tweets.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "model.joblib"


def main() -> int:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    if not DATASET_PATH.exists():
        print(f"[train_model] Missing dataset: {DATASET_PATH}")
        print("[train_model] Put your CSV in datasets/disaster_tweets.csv then re-run.")
        return 2

    df = pd.read_csv(DATASET_PATH)
    if "text" not in df.columns or "target" not in df.columns:
        raise SystemExit("Dataset must contain columns: text, target")

    X = df["text"].astype(str).fillna("")
    y = pd.to_numeric(df["target"], errors="coerce").fillna(0).astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if y.nunique() > 1 else None
    )

    model = Pipeline(
        steps=[
            (
                "tfidf",
                TfidfVectorizer(
                    lowercase=True,
                    strip_accents="unicode",
                    ngram_range=(1, 2),
                    max_features=50_000,
                ),
            ),
            ("clf", LogisticRegression(max_iter=2000, n_jobs=None)),
        ]
    )

    model.fit(X_train, y_train)
    score = model.score(X_test, y_test)

    joblib.dump(model, MODEL_PATH)
    print(f"[train_model] Saved model to: {MODEL_PATH}")
    print(f"[train_model] Holdout accuracy: {score:.4f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

