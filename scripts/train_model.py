from __future__ import annotations

import re
from pathlib import Path

import joblib
import nltk
import numpy as np
import pandas as pd
from nltk.corpus import stopwords
from nltk.sentiment import SentimentIntensityAnalyzer
from nltk.stem import PorterStemmer
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.calibration import CalibratedClassifierCV
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC

from scripts.preprocessors import TextPreprocessor, FeatureEngineer, passthrough_text  # noqa: F401

BASE_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = BASE_DIR / "datasets" / "disaster_tweets.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "model.joblib"
OUTPUT_DIR = BASE_DIR / "outputs" / "charts"


def ensure_nltk() -> None:
    nltk.download("punkt", quiet=True)
    nltk.download("punkt_tab", quiet=True)
    nltk.download("stopwords", quiet=True)
    nltk.download("vader_lexicon", quiet=True)


def build_pipeline(model, include_extra: bool = True):
    feature_steps = [
        (
            "tfidf",
            TfidfVectorizer(
                tokenizer=str.split,
                preprocessor=passthrough_text,
                lowercase=False,
                ngram_range=(1, 2),
                max_features=10_000,
            ),
        )
    ]
    if include_extra:
        feature_steps.append(("extra", FeatureEngineer()))

    return Pipeline(
        steps=[
            ("prep", TextPreprocessor()),
            ("features", FeatureUnion(feature_steps)),
            ("clf", model),
        ]
    )


def main() -> int:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ensure_nltk()

    if not DATASET_PATH.exists():
        print(f"[train_model] Missing dataset: {DATASET_PATH}")
        print("[train_model] Put your CSV in datasets/disaster_tweets.csv then re-run.")
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

    X = df[text_col].astype(str).fillna("")
    y = df[label_col].astype(str).fillna("")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if y.nunique() > 1 else None
    )

    models = {
        "log_reg": (LogisticRegression(max_iter=1500, n_jobs=None), True),
    }

    results = []
    best_model = None
    best_score = -1.0

    for name, (model, include_extra) in models.items():
        pipeline = build_pipeline(model, include_extra=include_extra)
        pipeline.fit(X_train, y_train)

        preds = pipeline.predict(X_test)
        metrics = {
            "model": name,
            "f1_macro": f1_score(y_test, preds, average="macro"),
            "precision_macro": precision_score(y_test, preds, average="macro"),
            "recall_macro": recall_score(y_test, preds, average="macro"),
            "accuracy": accuracy_score(y_test, preds),
        }
        results.append(metrics)

        if metrics["f1_macro"] > best_score:
            best_score = metrics["f1_macro"]
            best_model = pipeline

    if best_model is None:
        raise SystemExit("[train_model] No model trained.")

    results_df = pd.DataFrame(results).sort_values("f1_macro", ascending=False)
    results_path = OUTPUT_DIR / "model_comparison.csv"
    results_df.to_csv(results_path, index=False)

    joblib.dump(best_model, MODEL_PATH)
    print(f"[train_model] Saved model to: {MODEL_PATH}")
    print(f"[train_model] Saved comparison to: {results_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

