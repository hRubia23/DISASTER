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
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import FeatureUnion, Pipeline
from sklearn.svm import LinearSVC

BASE_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = BASE_DIR / "datasets" / "disaster_tweets.csv"
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "model.joblib"
OUTPUT_DIR = BASE_DIR / "outputs" / "charts"


def ensure_nltk() -> None:
    nltk.download("punkt", quiet=True)
    nltk.download("stopwords", quiet=True)
    nltk.download("vader_lexicon", quiet=True)


class TextPreprocessor(BaseEstimator, TransformerMixin):
    def __init__(self):
        self._stopwords = set(stopwords.words("english"))
        self._stemmer = PorterStemmer()

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        cleaned = []
        for text in X:
            cleaned.append(self._clean_text(str(text)))
        return cleaned

    def _clean_text(self, text: str) -> str:
        text = text.lower()
        text = re.sub(r"http\S+", " ", text)
        text = re.sub(r"@\w+", " ", text)
        text = text.replace("#", " ")
        text = re.sub(r"[^a-z\s]", " ", text)
        tokens = nltk.word_tokenize(text)
        tokens = [t for t in tokens if t not in self._stopwords and len(t) > 1]
        stems = [self._stemmer.stem(t) for t in tokens]
        return " ".join(stems)


class FeatureEngineer(BaseEstimator, TransformerMixin):
    def __init__(self):
        self._sia = SentimentIntensityAnalyzer()
        self._urgency_terms = {
            "help",
            "rescue",
            "trapped",
            "urgent",
            "drowning",
            "sagipin",
            "naiipit",
        }

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        features = []
        for text in X:
            raw = str(text)
            lowered = raw.lower()
            length = len(raw)
            word_count = len(raw.split())
            urgency = 1 if any(term in lowered for term in self._urgency_terms) else 0
            sentiment = self._sia.polarity_scores(raw).get("compound", 0.0)
            features.append([length, word_count, urgency, sentiment])
        return np.array(features)


def build_pipeline(model):
    return Pipeline(
        steps=[
            ("prep", TextPreprocessor()),
            (
                "features",
                FeatureUnion(
                    [
                        (
                            "tfidf",
                            TfidfVectorizer(
                                tokenizer=str.split,
                                preprocessor=lambda x: x,
                                lowercase=False,
                                ngram_range=(1, 2),
                                max_features=10_000,
                            ),
                        ),
                        ("extra", FeatureEngineer()),
                    ]
                ),
            ),
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
    if "text" not in df.columns:
        raise SystemExit("Dataset must contain column: text")

    label_col = None
    for candidate in ("label", "category"):
        if candidate in df.columns:
            label_col = candidate
            break
    if not label_col:
        raise SystemExit("Dataset must contain column: label or category")

    X = df["text"].astype(str).fillna("")
    y = df[label_col].astype(str).fillna("")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if y.nunique() > 1 else None
    )

    models = {
        "naive_bayes": (MultinomialNB(), {"clf__alpha": [0.5, 1.0]}),
        "log_reg": (LogisticRegression(max_iter=3000, n_jobs=None), {"clf__C": [0.5, 1.0, 2.0]}),
        "svm_linear": (
            CalibratedClassifierCV(LinearSVC(), cv=3),
            {"clf__base_estimator__C": [0.5, 1.0, 2.0]},
        ),
    }

    results = []
    best_model = None
    best_score = -1.0

    for name, (model, grid) in models.items():
        pipeline = build_pipeline(model)
        search = GridSearchCV(pipeline, grid, cv=5, scoring="f1_macro", n_jobs=None)
        search.fit(X_train, y_train)

        preds = search.best_estimator_.predict(X_test)
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
            best_model = search.best_estimator_

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

