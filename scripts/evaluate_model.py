from __future__ import annotations

from pathlib import Path
import torch
import numpy as np
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.metrics import ConfusionMatrixDisplay, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from transformers import AutoModelForSequenceClassification, AutoTokenizer, pipeline

BASE_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = BASE_DIR / "datasets" / "disaster_tweets.csv"
MODEL_DIR = BASE_DIR / "models" / "distilbert_model"
OUTPUT_DIR = BASE_DIR / "outputs" / "charts"

# Class labels mapping
CLASS_LABELS = {
    0: "General Information",
    1: "Rescue Request",
    2: "Damage Report",
    3: "Safety Update"
}


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not MODEL_DIR.exists():
        print(f"[evaluate_model] Missing model: {MODEL_DIR}")
        print("[evaluate_model] Run: py scripts\\train_model.py")
        return 2

    if not DATASET_PATH.exists():
        print(f"[evaluate_model] Missing dataset: {DATASET_PATH}")
        print("[evaluate_model] Put your CSV in datasets/disaster_tweets.csv then re-run.")
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

    # Load model and tokenizer
    device = 0 if torch.cuda.is_available() else -1
    model = AutoModelForSequenceClassification.from_pretrained(str(MODEL_DIR))
    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR))
    
    # Create pipeline for inference
    classifier = pipeline("text-classification", model=model, tokenizer=tokenizer, device=device)
    
    # Predict on test set
    y_pred_labels = []
    for text in X_test:
        result = classifier(text, truncation=True, max_length=512)
        # Pipeline returns the actual class label name
        pred_label = result[0]["label"]
        y_pred_labels.append(pred_label)
    
    y_pred = np.array(y_pred_labels)
    
    report = classification_report(y_test, y_pred, digits=4)
    report_path = OUTPUT_DIR / "classification_report.txt"
    report_path.write_text(report, encoding="utf-8")

    labels = sorted(y.unique())
    cm = confusion_matrix(y_test, y_pred, labels=labels)
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels)
    fig, ax = plt.subplots(figsize=(8, 7))
    disp.plot(ax=ax, cmap="Blues", values_format="d", colorbar=False)
    ax.set_title("Confusion Matrix - 4-Category Classification")
    plt.tight_layout()
    cm_path = OUTPUT_DIR / "confusion_matrix.png"
    plt.savefig(cm_path, dpi=160)
    plt.close(fig)

    print(f"[evaluate_model] Saved: {report_path}")
    print(f"[evaluate_model] Saved: {cm_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

