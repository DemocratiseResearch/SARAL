import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("firebase_service_account.json")
firebase_admin.initialize_app(cred)
db = firestore.client()
