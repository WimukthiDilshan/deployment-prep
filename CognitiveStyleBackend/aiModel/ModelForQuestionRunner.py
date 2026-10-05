import pickle
import pandas as pd

with open("cognitive_style_rf.pkl", "rb") as f:
    model = pickle.load(f)

with open("feature_columns.pkl", "rb") as f:
    feature_columns = pickle.load(f)

def predict_cognitive_style(feature_dict: dict):
    row = pd.DataFrame([feature_dict])[feature_columns]
    pred = model.predict(row)[0]
    proba = model.predict_proba(row)[0]
    classes = list(model.classes_)
    probs = {cls: float(p) for cls, p in zip(classes, proba)}
    return {
        "prediction": pred,
        "probabilities": probs
    }