"""Reusable sklearn transformers — kept in a separate module so joblib can
unpickle them from any entry point (app.py, evaluate_model.py, etc.)."""
from __future__ import annotations

import re

import nltk
import numpy as np
from nltk.corpus import stopwords
from nltk.sentiment import SentimentIntensityAnalyzer
from nltk.stem import PorterStemmer
from sklearn.base import BaseEstimator, TransformerMixin


def passthrough_text(value: str) -> str:
    return value


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
