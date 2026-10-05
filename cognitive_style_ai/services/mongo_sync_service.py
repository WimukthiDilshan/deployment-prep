import hashlib
import json
import logging
import threading

from pymongo import DESCENDING, MongoClient
from sqlalchemy.orm import sessionmaker

from config.database import get_engine
from config.settings import settings
from models.analysis import CognitiveStyleAnalysis


logger = logging.getLogger(__name__)


def _fingerprint(cursor_document: dict, gaze_document: dict, features: dict) -> str:
    payload = {
        "cursor_id": str(cursor_document.get("_id", "")),
        "gaze_id": str(gaze_document.get("_id", "")),
        "features": features,
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _feature_values(cursor_document: dict, gaze_document: dict) -> dict[str, float]:
    preference = str(gaze_document.get("FirstInteractionPreference", "TEXT")).upper()
    return {
        "imageCursorRatio": float(cursor_document.get("imageCursorRatio", 0.0)),
        "imageScrollRatio": float(cursor_document.get("imageScrollRatio", 0.0)),
        "ImageGazeRatio": float(gaze_document.get("ImageGazeRatio", 0.0)),
        "FirstInteractionPreference_VISUAL": 1.0 if preference == "VISUAL" else 0.0,
    }


def sync_mongo_inputs_once() -> dict[str, int]:
    mongo_client = MongoClient(settings.MONGO_URL, serverSelectionTimeoutMS=5000)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=get_engine())
    inserted = 0
    updated = 0
    try:
        mongo_database = mongo_client[settings.MONGO_DB_NAME]
        cursor_collection = mongo_database[settings.MONGO_CURSOR_COLLECTION]
        gaze_collection = mongo_database[settings.MONGO_GAZE_COLLECTION]
        student_ids = set(cursor_collection.distinct("userId")) & set(gaze_collection.distinct("userId"))

        with session_factory() as db:
            for raw_student_id in student_ids:
                student_id = str(raw_student_id)
                completed_exists = (
                    db.query(CognitiveStyleAnalysis.id)
                    .filter(
                        CognitiveStyleAnalysis.student_id == student_id,
                        CognitiveStyleAnalysis.analysis_status == "completed",
                    )
                    .first()
                )
                if completed_exists:
                    continue

                cursor_document = cursor_collection.find_one(
                    {"userId": raw_student_id}, sort=[("_id", DESCENDING)]
                )
                gaze_document = gaze_collection.find_one(
                    {"userId": raw_student_id}, sort=[("_id", DESCENDING)]
                )
                if not cursor_document or not gaze_document:
                    continue

                features = _feature_values(cursor_document, gaze_document)
                source_fingerprint = _fingerprint(cursor_document, gaze_document, features)
                if (
                    db.query(CognitiveStyleAnalysis.id)
                    .filter(CognitiveStyleAnalysis.source_fingerprint == source_fingerprint)
                    .first()
                ):
                    continue

                existing_pending = (
                    db.query(CognitiveStyleAnalysis)
                    .filter(
                        CognitiveStyleAnalysis.student_id == student_id,
                        CognitiveStyleAnalysis.analysis_status == "pending",
                    )
                    .order_by(CognitiveStyleAnalysis.created_at.desc(), CognitiveStyleAnalysis.id.desc())
                    .first()
                )
                if existing_pending is not None:
                    existing_pending.session_id = student_id
                    existing_pending.source_fingerprint = source_fingerprint
                    existing_pending.feature_values = features
                    updated += 1
                    continue

                # Cognitive style is a student-level profile. Keep one pending
                # snapshot per student and stop syncing after that profile has
                # been analysed successfully.
                pending = CognitiveStyleAnalysis(
                    lesson_id=None,
                    student_id=student_id,
                    session_id=student_id,
                    source_fingerprint=source_fingerprint,
                    analysis_status="pending",
                    cognitive_style=None,
                    model_signature=None,
                    confidence=None,
                    feature_values=features,
                    lime_output=None,
                    shap_output=None,
                    top_features=None,
                )
                db.add(pending)
                inserted += 1
            db.commit()
    finally:
        mongo_client.close()
    return {"inserted": inserted, "updated": updated}


class MongoInputSynchronizer:
    def __init__(self):
        self._stop_event = threading.Event()
        self._thread = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name="cognitive-style-mongo-sync", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                sync_mongo_inputs_once()
            except Exception:
                logger.exception("MongoDB input synchronization failed.")
            self._stop_event.wait(max(0.5, settings.MONGO_SYNC_INTERVAL_SECONDS))


mongo_input_synchronizer = MongoInputSynchronizer()
