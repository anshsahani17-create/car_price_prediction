from flask import Flask, render_template, request, jsonify
from pathlib import Path
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import joblib
from datetime import datetime

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "car_resale_data.csv"
MODEL_PATH = BASE_DIR / "car_resale_model.joblib"

app = Flask(__name__)

# Model identity is included so different cars don't collapse to the same estimate.
CATEGORICAL = ["brand", "model", "fuel", "transmission", "owner"]
NUMERIC = ["year", "km_driven", "engine_cc", "mileage_kmpl", "seats"]
FEATURES = CATEGORICAL + NUMERIC
TARGET = "selling_price_lakh"

def load_data():
    df = pd.read_csv(DATA_PATH)
    for col in CATEGORICAL:
        df[col] = df[col].fillna("Unknown").astype(str)
    for col in NUMERIC + [TARGET]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=NUMERIC + [TARGET])
    return df

def train_model():
    df = load_data()
    X, y = df[FEATURES], df[TARGET]
    categorical_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore"))
    ])
    numeric_pipe = Pipeline([
        ("imputer", SimpleImputer(strategy="median"))
    ])
    preprocessor = ColumnTransformer([
        ("cat", categorical_pipe, CATEGORICAL),
        ("num", numeric_pipe, NUMERIC)
    ])
    model = Pipeline([
        ("preprocess", preprocessor),
        ("regressor", RandomForestRegressor(
            n_estimators=220, min_samples_leaf=2, random_state=42, n_jobs=-1
        ))
    ])
    model.fit(X, y)
    joblib.dump(model, MODEL_PATH)
    return model

def get_model():
    if MODEL_PATH.exists():
        try:
            return joblib.load(MODEL_PATH)
        except Exception:
            pass
    return train_model()

model = get_model()

@app.route("/")
def home():
    df = load_data()
    brands = sorted(df["brand"].dropna().unique().tolist())
    models_by_brand = {
        brand: sorted(df.loc[df["brand"] == brand, "model"].dropna().unique().tolist())
        for brand in brands
    }
    return render_template("index.html", brands=brands, models_by_brand=models_by_brand,
                           current_year=datetime.now().year)

@app.route("/api/estimate", methods=["POST"])
def estimate():
    payload = request.get_json(silent=True) or request.form.to_dict()
    try:
        brand = str(payload["brand"]).strip()
        car_model = str(payload["model"]).strip()
        year = int(payload["year"])
        km_driven = float(payload["km_driven"])
        fuel = str(payload["fuel"])
        transmission = str(payload["transmission"])
        owner = str(payload["owner"])
        engine_cc = float(payload.get("engine_cc", 1200))
        mileage_kmpl = float(payload.get("mileage_kmpl", 18))
        seats = int(payload.get("seats", 5))
        current_year = datetime.now().year
        if not brand or not car_model:
            raise ValueError("Please select a brand and model.")
        if year < 1990 or year > current_year or km_driven < 0 or km_driven > 1000000:
            raise ValueError(f"Enter a valid year (1990–{current_year}) and kilometres.")
        if engine_cc < 0 or engine_cc > 8000 or mileage_kmpl < 1 or mileage_kmpl > 500:
            raise ValueError("Please check engine capacity and mileage.")
        row = pd.DataFrame([{
            "brand": brand, "model": car_model, "fuel": fuel,
            "transmission": transmission, "owner": owner, "year": year,
            "km_driven": km_driven, "engine_cc": engine_cc,
            "mileage_kmpl": mileage_kmpl, "seats": seats
        }], columns=FEATURES)
        estimate_lakh = float(model.predict(row)[0])
        # Keep output in a sensible range; dataset is expressed in INR lakhs.
        estimate_lakh = max(0.35, min(estimate_lakh, 250.0))
        # A transparent indicative range, not a guaranteed offer.
        low = estimate_lakh * 0.90
        high = estimate_lakh * 1.10
        return jsonify({
            "ok": True,
            "price": round(estimate_lakh * 100000),
            "low": round(low * 100000),
            "high": round(high * 100000),
            "age": current_year - year,
            "note": "Indicative AI estimate based on the included sample dataset. Actual offers depend on condition, location, service history and market demand."
        })
    except (KeyError, TypeError, ValueError) as exc:
        return jsonify({"ok": False, "error": str(exc)}), 400
    except Exception:
        app.logger.exception("Estimate failed")
        return jsonify({"ok": False, "error": "Estimate failed. Please check your inputs and try again."}), 500

@app.route("/api/models")
def models():
    brand = request.args.get("brand", "")
    df = load_data()
    choices = sorted(df.loc[df["brand"] == brand, "model"].unique().tolist())
    return jsonify(choices)

if __name__ == "__main__":
    app.run(debug=True)
