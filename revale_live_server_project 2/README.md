# Revale — Used Car Resale Value Website

## Quick start with VS Code Live Server
1. Extract the ZIP.
2. Open the `revale_live_server_project` folder in VS Code.
3. Right-click the root `index.html` and choose **Open with Live Server**.
4. The page design, animations, brand/model dropdowns and form will work. The displayed price is a clearly labelled **demo estimate** because Live Server cannot execute Python or the Flask API.

## Run the real Flask + machine-learning backend
Requires Python 3.10+. Open a terminal in this folder and run:

```bash
python3 -m venv .venv
source .venv/bin/activate  # macOS/Linux
# Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000. Flask serves `templates/index.html` and uses `data/car_resale_data.csv` to train/load the model.

## Project files
- `index.html` — standalone version for Live Server (no Jinja syntax).
- `templates/index.html` — Flask/Jinja version.
- `static/css/style.css` — styling and animations.
- `static/js/main.js` — interactions and estimate request; Live Server falls back to a labelled demo estimate.
- `app.py` — Flask API and scikit-learn model.
- `data/car_resale_data.csv` — synthetic demo dataset.
- `requirements.txt` — Python dependencies.

## Important dataset note
The included CSV is synthetic demo data, not verified market data. Estimates are educational and must not be treated as a guaranteed resale quote. For credible valuations, replace the CSV with a legally obtained and cleaned dataset of actual listings or transactions and evaluate the model on held-out data.


## Expanded dataset (100,000 rows)
`data/car_resale_data.csv` contains 100,000 synthetic training rows covering the model catalog in `data/car_models_catalog.csv`. These are generated demo/training data, not verified real listings or official resale prices. The catalog is broad but cannot guarantee every model/variant ever sold in India.
