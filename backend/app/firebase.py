import firebase_admin
from firebase_admin import credentials, firestore

# Use the Firebase credentials from the app directory
cred = credentials.Certificate("app/firebase_service_account.json")
firebase_admin.initialize_app(cred)
db = firestore.client()
