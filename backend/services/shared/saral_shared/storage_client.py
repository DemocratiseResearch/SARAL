import os
import json
import urllib.parse
from datetime import timedelta

from google.cloud import storage as gcs
from google.api_core.client_options import ClientOptions

ENV = os.environ.get("ENV", "local")
BUCKET = os.environ.get("STORAGE_BUCKET", "saral-artifacts-local")

_client: "gcs.Client | None" = None


def _get_client() -> gcs.Client:
    global _client
    if _client is None:
        emulator_host = os.environ.get("STORAGE_EMULATOR_HOST", "")
        if emulator_host:
            if not emulator_host.startswith("http"):
                emulator_host = "http://" + emulator_host
            _client = gcs.Client(
                project="local",
                client_options=ClientOptions(api_endpoint=emulator_host),
            )
        else:
            _client = gcs.Client()
    return _client


def upload_file(local_path: str, object_key: str, content_type: str = "application/octet-stream") -> str:
    blob = _get_client().bucket(BUCKET).blob(object_key)
    blob.upload_from_filename(local_path, content_type=content_type)
    return f"gs://{BUCKET}/{object_key}"


def upload_bytes(data: bytes, object_key: str, content_type: str = "application/octet-stream") -> str:
    blob = _get_client().bucket(BUCKET).blob(object_key)
    blob.upload_from_string(data, content_type=content_type)
    return f"gs://{BUCKET}/{object_key}"


def upload_json(data: dict, object_key: str) -> str:
    return upload_bytes(
        json.dumps(data, ensure_ascii=False).encode("utf-8"),
        object_key,
        content_type="application/json",
    )


def download_to_file(storage_path: str, local_path: str):
    key = _extract_key(storage_path)
    _get_client().bucket(BUCKET).blob(key).download_to_filename(local_path)


def download_bytes(storage_path: str) -> bytes:
    key = _extract_key(storage_path)
    return _get_client().bucket(BUCKET).blob(key).download_as_bytes()


def download_json(storage_path: str) -> dict:
    return json.loads(download_bytes(storage_path).decode("utf-8"))


def list_objects(prefix: str) -> list[str]:
    if prefix.startswith("gs://"):
        prefix = _extract_key(prefix)
    blobs = _get_client().list_blobs(BUCKET, prefix=prefix)
    return sorted(f"gs://{BUCKET}/{b.name}" for b in blobs)


def generate_presigned_url(storage_path: str, expiry_seconds: int = 3600) -> str:
    key = _extract_key(storage_path)

    if ENV == "local":
        emulator = os.environ.get("STORAGE_EMULATOR_HOST", "localhost:4443")
        if not emulator.startswith("http"):
            emulator = "http://" + emulator
        encoded_key = urllib.parse.quote(key, safe="")
        return f"{emulator}/download/storage/v1/b/{BUCKET}/o/{encoded_key}?alt=media"

    blob = _get_client().bucket(BUCKET).blob(key)
    return blob.generate_signed_url(
        expiration=timedelta(seconds=expiry_seconds),
        method="GET",
        version="v4",
    )


def _extract_key(storage_path: str) -> str:
    if storage_path.startswith("gs://"):
        parts = storage_path[len("gs://"):].split("/", 1)
        return parts[1] if len(parts) > 1 else ""
    return storage_path
