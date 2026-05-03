from __future__ import annotations

from pathlib import Path

import joblib
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.metrics import ConfusionMatrixDisplay, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = BASE_DIR / "datasets" / "disaster_tweets.csv"
MODEL_PATH = BASE_DIR / "models" / "model.joblib"
OUTPUT_DIR = BASE_DIR / "outputs" / "charts"


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not MODEL_PATH.exists():
        print(f"[evaluate_model] Missing model: {MODEL_PATH}")
        print("[evaluate_model] Run: py scripts\\train_model.py")
        return 2

    if not DATASET_PATH.exists():
        print(f"[evaluate_model] Missing dataset: {DATASET_PATH}")
        print("[evaluate_model] Put your CSV in datasets/disaster_tweets.csv then re-run.")
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

    model = joblib.load(MODEL_PATH)
    y_pred = model.predict(X_test)

    report = classification_report(y_test, y_pred, digits=4)
    report_path = OUTPUT_DIR / "classification_report.txt"
    report_path.write_text(report, encoding="utf-8")

    labels = sorted(y.unique())
    cm = confusion_matrix(y_test, y_pred, labels=labels)
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=labels)
    fig, ax = plt.subplots(figsize=(7, 6))
    disp.plot(ax=ax, cmap="Blues", values_format="d", colorbar=False)
    ax.set_title("Confusion Matrix")
    plt.tight_layout()
    cm_path = OUTPUT_DIR / "confusion_matrix.png"
    plt.savefig(cm_path, dpi=160)
    plt.close(fig)

    print(f"[evaluate_model] Saved: {report_path}")
    print(f"[evaluate_model] Saved: {cm_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

