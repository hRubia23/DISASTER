from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from torch.optim import AdamW
from torch.utils.data import DataLoader, Dataset
from transformers import (
    DistilBertForSequenceClassification,
    DistilBertTokenizerFast,
    get_linear_schedule_with_warmup,
)

BASE_DIR = Path(__file__).resolve().parents[1]
DATASET_PATH = BASE_DIR / "datasets" / "disaster_tweets.csv"
MODEL_DIR = BASE_DIR / "models" / "distilbert_model"
OUTPUT_DIR = BASE_DIR / "outputs" / "charts"

# Map original fine-grained labels -> 4 categories
LABEL_MAP = {
    "rescue_volunteering_or_donation_effort": "Rescue Request",
    "requests_or_urgent_needs": "Rescue Request",
    "injured_or_dead_people": "Rescue Request",
    "missing_or_found_people": "Rescue Request",
    "infrastructure_and_utility_damage": "Damage Report",
    "displaced_people_and_evacuations": "Safety Update",
    "caution_and_advice": "Safety Update",
    "sympathy_and_support": "General Information",
    "other_relevant_information": "General Information",
    "not_humanitarian": "General Information",
}

CATEGORIES = ["General Information", "Rescue Request", "Damage Report", "Safety Update"]
LABEL2ID = {label: i for i, label in enumerate(CATEGORIES)}
ID2LABEL = {i: label for i, label in enumerate(CATEGORIES)}


class TweetDataset(Dataset):
    def __init__(self, encodings, labels):
        self.encodings = encodings
        self.labels = labels

    def __getitem__(self, idx):
        item = {key: torch.tensor(val[idx]) for key, val in self.encodings.items()}
        item["labels"] = torch.tensor(self.labels[idx])
        return item

    def __len__(self):
        return len(self.labels)


def main() -> int:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    if not DATASET_PATH.exists():
        print(f"[train_model] Missing dataset: {DATASET_PATH}")
        print("[train_model] Put your CSV in datasets/disaster_tweets.csv then re-run.")
        return 2

    df = pd.read_csv(DATASET_PATH)
    df.columns = df.columns.str.strip()

    texts = df["tweet_text"].astype(str).fillna("").tolist()
    raw_labels = df["class_label"].astype(str).fillna("").str.strip().tolist()
    mapped_labels = [LABEL_MAP.get(lbl, "General Information") for lbl in raw_labels]
    label_ids = [LABEL2ID[lbl] for lbl in mapped_labels]

    X_train, X_test, y_train, y_test = train_test_split(
        texts, label_ids, test_size=0.2, random_state=42, stratify=label_ids
    )
    print(f"[train_model] Train: {len(X_train)}, Test: {len(X_test)}")

    tokenizer = DistilBertTokenizerFast.from_pretrained("distilbert-base-uncased")
    train_enc = tokenizer(X_train, truncation=True, padding=True, max_length=128)
    test_enc = tokenizer(X_test, truncation=True, padding=True, max_length=128)

    train_dataset = TweetDataset(train_enc, y_train)
    test_dataset = TweetDataset(test_enc, y_test)

    train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=32)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"[train_model] Using device: {device}")

    model = DistilBertForSequenceClassification.from_pretrained(
        "distilbert-base-uncased",
        num_labels=len(CATEGORIES),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )
    model.to(device)

    num_epochs = 5
    optimizer = AdamW(model.parameters(), lr=2e-5, weight_decay=0.01)
    total_steps = len(train_loader) * num_epochs
    scheduler = get_linear_schedule_with_warmup(optimizer, num_warmup_steps=0, num_training_steps=total_steps)

    best_f1 = -1.0
    best_state = None

    for epoch in range(num_epochs):
        model.train()
        total_loss = 0.0
        for batch in train_loader:
            optimizer.zero_grad()
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)
            outputs = model(input_ids=input_ids, attention_mask=attention_mask, labels=labels)
            loss = outputs.loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            total_loss += loss.item()

        avg_loss = total_loss / len(train_loader)

        # Evaluate
        model.eval()
        all_preds, all_labels = [], []
        with torch.no_grad():
            for batch in test_loader:
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                labels = batch["labels"].to(device)
                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                preds = torch.argmax(outputs.logits, dim=-1)
                all_preds.extend(preds.cpu().numpy())
                all_labels.extend(labels.cpu().numpy())

        f1 = f1_score(all_labels, all_preds, average="macro", zero_division=0)
        acc = accuracy_score(all_labels, all_preds)
        print(f"[Epoch {epoch+1}/{num_epochs}] loss={avg_loss:.4f} | f1_macro={f1:.4f} | acc={acc:.4f}")

        if f1 > best_f1:
            best_f1 = f1
            best_state = {k: v.clone() for k, v in model.state_dict().items()}

    # Load best weights and save
    model.load_state_dict(best_state)
    model.save_pretrained(str(MODEL_DIR))
    tokenizer.save_pretrained(str(MODEL_DIR))
    print(f"[train_model] Saved DistilBERT model to: {MODEL_DIR}")

    # Final eval metrics
    model.eval()
    all_preds, all_labels = [], []
    with torch.no_grad():
        for batch in test_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)
            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            preds = torch.argmax(outputs.logits, dim=-1)
            all_preds.extend(preds.cpu().numpy())
            all_labels.extend(labels.cpu().numpy())

    pd.DataFrame([{
        "model": "distilbert-base-uncased",
        "accuracy": accuracy_score(all_labels, all_preds),
        "f1_macro": f1_score(all_labels, all_preds, average="macro", zero_division=0),
        "precision_macro": precision_score(all_labels, all_preds, average="macro", zero_division=0),
        "recall_macro": recall_score(all_labels, all_preds, average="macro", zero_division=0),
    }]).to_csv(OUTPUT_DIR / "model_comparison.csv", index=False)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

