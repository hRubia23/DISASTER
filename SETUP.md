## Setup & Run Guide (Python / Flask)

This system runs locally on **Python (Flask)**.

---

## 1) Get the code

```bash
git clone <YOUR_GITHUB_REPO_URL>
cd DISASTER
```

---

## 2) Install Python dependencies

```bash
py -m pip install -r requirements.txt
```

---

## 3) Run the localhost server

```bash
py app.py
```

Open in your browser:
- `http://127.0.0.1:5000/`

Stop the server:
- Press `CTRL + C` in the terminal.

---

## 4) Database (Authentication)

- **Type**: SQLite (no separate database install needed)
- **File**: `users.db`
- **Where**: project root folder (auto-created when you run `py app.py`)

You can share the database by copying `users.db` to another machine and placing it in the same project root.

---

## 5) Register / Login

1. Open `http://127.0.0.1:5000/`
2. Create an account (Register)
3. Log in (Sign In)

### Admin Credentials (for testing)

Use these credentials to test admin features:
- **Email**: `admin@disaster.com`
- **Password**: `admin123`
- **Full Name**: Admin User
- **Organization**: DISASTER
- **Role**: admin

**Note**: This is for testing only. Change credentials before production deployment.

---

## 6) Optional: Enable ML model-backed classification

The app can use a trained model file at:
- `models/model.joblib`

### A) Add dataset
Place your CSV here:
- `datasets/disaster_tweets.csv`

Expected columns:
- `text` (tweet text)
- `label` (category name: Rescue Request, Damage Report, Safety Update, General Information)

### B) Train the model

```bash
py scripts\train_model.py
```

### C) Generate charts / metrics (for report)

```bash
py scripts\plot_eda.py
py scripts\evaluate_model.py
```

Outputs:
- `outputs/graphs/*.png`
- `outputs/charts/confusion_matrix.png`
- `outputs/charts/classification_report.txt`
- `outputs/charts/model_comparison.csv`

