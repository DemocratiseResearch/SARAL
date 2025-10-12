import firebase_admin
from firebase_admin import credentials, firestore
from pathlib import Path

# Get the path to the Firebase credentials file dynamically
current_file = Path(__file__).resolve()
backend_root = current_file.parent.parent  # Go up from app -> backend
firebase_credentials = backend_root / "app" / "firebase_service_account.json"

cred = credentials.Certificate(str(firebase_credentials))
firebase_admin.initialize_app(cred)
db = firestore.client()
