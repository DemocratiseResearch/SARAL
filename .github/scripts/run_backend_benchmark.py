import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import Dict, List

import requests
from sklearn.feature_extraction.text import TfidfVectorizer


ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT / "backend"
BACKEND_SCRIPTS_DIR = BACKEND_DIR / "temp" / "scripts"
ARTIFACT_SUBDIR = os.getenv("ARTIFACT_SUBDIR", "backend-benchmark")
RUNTIME_DIR = ROOT / ".github" / "eval-artifacts" / ARTIFACT_SUBDIR
GENERATED_DIR = RUNTIME_DIR / "generated_scripts"
DOWNLOADS_DIR = RUNTIME_DIR / "downloads"

MANIFEST_PATH = ROOT / os.getenv("BACKEND_EVAL_MANIFEST", ".github/eval-fixtures/backend/benchmark_manifest.jsonl")
BASELINE_METRICS_PATH = ROOT / os.getenv("BASELINE_METRICS_PATH", ".github/eval-fixtures/backend/baseline_metrics.json")

BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://127.0.0.1:8000")
EXTERNAL_APP_API_KEY = os.getenv("EXTERNAL_APP_API_KEY", "")
MIN_SUPPORT_RATE_MEAN = float(os.getenv("MIN_SUPPORT_RATE_MEAN", "0.68"))
MAX_HALLUCINATION_RATE_MEAN = float(os.getenv("MAX_HALLUCINATION_RATE_MEAN", "0.18"))
MIN_SOURCE_COVERAGE_PROXY_MEAN = float(os.getenv("MIN_SOURCE_COVERAGE_PROXY_MEAN", "0.55"))
MIN_DELTA_SUPPORT_RATE_MEAN = float(os.getenv("MIN_DELTA_SUPPORT_RATE_MEAN", "-0.08"))
MAX_DELTA_HALLUCINATION_RATE_MEAN = float(os.getenv("MAX_DELTA_HALLUCINATION_RATE_MEAN", "0.08"))


def normalize(text: str) -> str:
    return re.sub(r"\s+", " ", str(text)).strip()


def split_sentences(text: str) -> List[str]:
    text = normalize(text)
    if not text:
        return []
    return [part.strip() for part in re.split(r"(?<=[.!?])\s+", text) if part.strip()]


def chunk_source(text: str) -> List[str]:
    return [normalize(part) for part in re.split(r"\n\s*\n", text) if normalize(part)]


def flatten_claims(output: Dict) -> List[str]:
    claims = []
    for section in output.get("sections", {}).values():
        script = normalize(str(section.get("script", "")))
        bullets = [normalize(str(item)) for item in section.get("bullet_points", []) if normalize(str(item))]
        claims.extend([sentence for sentence in split_sentences(script) if len(sentence.split()) >= 4])
        claims.extend([bullet for bullet in bullets if len(bullet.split()) >= 3])
    return claims


def compute_metrics(source_text: str, output: Dict) -> Dict[str, float]:
    claims = flatten_claims(output)
    chunks = chunk_source(source_text)
    if not claims or not chunks:
        return {
            "claim_count": len(claims),
            "chunk_count": len(chunks),
            "support_rate": 0.0,
            "hallucination_rate": 1.0 if claims else 0.0,
            "source_coverage_proxy": 0.0,
        }

    vec = TfidfVectorizer(ngram_range=(1, 2), min_df=1)
    matrix = vec.fit_transform(claims + chunks)
    claim_matrix = matrix[: len(claims)]
    chunk_matrix = matrix[len(claims) :]
    similarity = claim_matrix @ chunk_matrix.T
    best_claim_scores = similarity.max(axis=1).toarray().ravel()
    best_chunk_scores = similarity.max(axis=0).toarray().ravel()

    return {
        "claim_count": len(claims),
        "chunk_count": len(chunks),
        "support_rate": round(sum(score >= 0.35 for score in best_claim_scores) / max(1, len(best_claim_scores)), 4),
        "hallucination_rate": round(sum(score < 0.20 for score in best_claim_scores) / max(1, len(best_claim_scores)), 4),
        "source_coverage_proxy": round(sum(score >= 0.20 for score in best_chunk_scores) / max(1, len(best_chunk_scores)), 4),
    }


def load_jsonl(path: Path) -> List[Dict]:
    rows = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        raw = raw.strip()
        if raw:
            rows.append(json.loads(raw))
    return rows


def load_baseline_metrics() -> Dict:
    payload = json.loads(BASELINE_METRICS_PATH.read_text(encoding="utf-8"))
    if "per_paper" not in payload or "overall" not in payload:
        raise RuntimeError(f"Baseline metrics file is missing required keys: {BASELINE_METRICS_PATH}")
    return payload


def derive_baseline_overall(paper_ids: List[str], baseline_per_paper: Dict[str, Dict]) -> Dict[str, float]:
    selected = [baseline_per_paper[paper_id] for paper_id in paper_ids if paper_id in baseline_per_paper]
    if not selected:
        return {}
    return {
        "runs": int(sum(item.get("runs", 0) for item in selected)),
        "support_rate_mean": round(sum(item["support_rate_mean"] for item in selected) / len(selected), 4),
        "hallucination_rate_mean": round(sum(item["hallucination_rate_mean"] for item in selected) / len(selected), 4),
        "source_coverage_proxy_mean": round(sum(item["source_coverage_proxy_mean"] for item in selected) / len(selected), 4),
    }


def download_pdf(url: str, destination: Path) -> None:
    response = requests.get(url, timeout=120)
    response.raise_for_status()
    destination.write_bytes(response.content)


def snapshot_script_files() -> Dict[str, float]:
    BACKEND_SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    return {path.name: path.stat().st_mtime for path in BACKEND_SCRIPTS_DIR.glob("*_scripts.json")}


def find_new_script_file(before: Dict[str, float], timeout_seconds: int = 20) -> Path:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        current_files = sorted(BACKEND_SCRIPTS_DIR.glob("*_scripts.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        for path in current_files:
            if path.name not in before or path.stat().st_mtime > before[path.name]:
                return path
        time.sleep(1)
    raise RuntimeError("No new generated script file detected after backend request")


def call_backend_generation(pdf_path: Path) -> Path:
    before = snapshot_script_files()
    with pdf_path.open("rb") as handle:
        response = requests.post(
            f"{BACKEND_BASE_URL}/api/external/generate-ppt",
            headers={"x-api-key": EXTERNAL_APP_API_KEY},
            files={"file": (pdf_path.name, handle, "application/pdf")},
            timeout=600,
        )

    new_script = find_new_script_file(before)
    if response.status_code >= 400 and not new_script.exists():
        raise RuntimeError(f"Backend request failed with status {response.status_code}: {response.text[:500]}")
    return new_script


def main() -> None:
    if not EXTERNAL_APP_API_KEY:
        raise SystemExit("Missing EXTERNAL_APP_API_KEY")

    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

    baseline = load_baseline_metrics()
    baseline_per_paper = baseline["per_paper"]
    manifest_rows = load_jsonl(MANIFEST_PATH)
    generated_rows = []

    for row in manifest_rows:
        paper_id = row["paper_id"]
        pdf_path = DOWNLOADS_DIR / f"{paper_id}.pdf"
        download_pdf(row["pdf_url"], pdf_path)

        generated_script_path = call_backend_generation(pdf_path)
        copied_script_path = GENERATED_DIR / generated_script_path.name
        shutil.copy2(generated_script_path, copied_script_path)

        output = json.loads(copied_script_path.read_text(encoding="utf-8"))
        source_text = (ROOT / row["source_text_path"]).read_text(encoding="utf-8")
        metrics = compute_metrics(source_text, output)
        baseline_metrics = baseline_per_paper.get(paper_id, {})

        generated_rows.append({
            "paper_id": paper_id,
            "domain": row["domain"],
            "generated_script_file": str(copied_script_path.relative_to(ROOT)),
            **metrics,
            "baseline_support_rate_mean": baseline_metrics.get("support_rate_mean"),
            "baseline_hallucination_rate_mean": baseline_metrics.get("hallucination_rate_mean"),
            "baseline_source_coverage_proxy_mean": baseline_metrics.get("source_coverage_proxy_mean"),
            "delta_support_rate": round(metrics["support_rate"] - baseline_metrics.get("support_rate_mean", 0.0), 4),
            "delta_hallucination_rate": round(metrics["hallucination_rate"] - baseline_metrics.get("hallucination_rate_mean", 0.0), 4),
            "delta_source_coverage_proxy": round(metrics["source_coverage_proxy"] - baseline_metrics.get("source_coverage_proxy_mean", 0.0), 4),
        })

    overall = {
        "runs": len(generated_rows),
        "support_rate_mean": round(sum(item["support_rate"] for item in generated_rows) / len(generated_rows), 4),
        "hallucination_rate_mean": round(sum(item["hallucination_rate"] for item in generated_rows) / len(generated_rows), 4),
        "source_coverage_proxy_mean": round(sum(item["source_coverage_proxy"] for item in generated_rows) / len(generated_rows), 4),
    }

    manifest_paper_ids = [row["paper_id"] for row in manifest_rows]
    baseline_overall = derive_baseline_overall(manifest_paper_ids, baseline_per_paper) or baseline.get("overall", {})
    deltas = {
        "delta_support_rate_mean": round(sum(item["delta_support_rate"] for item in generated_rows) / len(generated_rows), 4),
        "delta_hallucination_rate_mean": round(sum(item["delta_hallucination_rate"] for item in generated_rows) / len(generated_rows), 4),
        "delta_source_coverage_proxy_mean": round(sum(item["delta_source_coverage_proxy"] for item in generated_rows) / len(generated_rows), 4),
    }

    summary = {
        **overall,
        "baseline_support_rate_mean": baseline_overall.get("support_rate_mean"),
        "baseline_hallucination_rate_mean": baseline_overall.get("hallucination_rate_mean"),
        "baseline_source_coverage_proxy_mean": baseline_overall.get("source_coverage_proxy_mean"),
        **deltas,
    }
    (RUNTIME_DIR / "generated_eval_per_run.json").write_text(json.dumps(generated_rows, indent=2), encoding="utf-8")
    (RUNTIME_DIR / "generated_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(json.dumps(summary, indent=2))
    print(json.dumps(generated_rows, indent=2))

    if overall["support_rate_mean"] < MIN_SUPPORT_RATE_MEAN:
        raise SystemExit(f"Backend eval failed: support_rate_mean below {MIN_SUPPORT_RATE_MEAN:.2f}")
    if overall["hallucination_rate_mean"] > MAX_HALLUCINATION_RATE_MEAN:
        raise SystemExit(f"Backend eval failed: hallucination_rate_mean above {MAX_HALLUCINATION_RATE_MEAN:.2f}")
    if overall["source_coverage_proxy_mean"] < MIN_SOURCE_COVERAGE_PROXY_MEAN:
        raise SystemExit(f"Backend eval failed: source_coverage_proxy_mean below {MIN_SOURCE_COVERAGE_PROXY_MEAN:.2f}")
    if deltas["delta_support_rate_mean"] < MIN_DELTA_SUPPORT_RATE_MEAN:
        raise SystemExit(
            f"Backend eval failed: support_rate regressed more than {abs(MIN_DELTA_SUPPORT_RATE_MEAN):.2f} against baseline"
        )
    if deltas["delta_hallucination_rate_mean"] > MAX_DELTA_HALLUCINATION_RATE_MEAN:
        raise SystemExit(
            f"Backend eval failed: hallucination_rate regressed more than {MAX_DELTA_HALLUCINATION_RATE_MEAN:.2f} against baseline"
        )


if __name__ == "__main__":
    main()
