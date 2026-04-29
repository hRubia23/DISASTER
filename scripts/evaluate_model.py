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
    if "text" not in df.columns or "target" not in df.columns:
        raise SystemExit("Dataset must contain columns: text, target")

    X = df["text"].astype(str).fillna("")
    y = pd.to_numeric(df["target"], errors="coerce").fillna(0).astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y if y.nunique() > 1 else None
    )

    model = joblib.load(MODEL_PATH)
    y_pred = model.predict(X_test)

    report = classification_report(y_test, y_pred, digits=4)
    report_path = OUTPUT_DIR / "classification_report.txt"
    report_path.write_text(report, encoding="utf-8")

    cm = confusion_matrix(y_test, y_pred, labels=[0, 1])
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=["not_disaster(0)", "disaster(1)"])
    fig, ax = plt.subplots(figsize=(6, 5))
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

