"""AR service/component-detection quantitative benchmark.

This test is report-oriented and non-gating by default. It measures:
- service success rate (did extraction run and return valid shape)
- route success rate (did /api/ar/generate return HTTP 200)
- count error/accuracy proxies against ground-truth component counts
- component schema quality (field validity and normalized ranges)
- latency statistics (mean, median, p90, p95, max)

Dataset options:
1) Keep using ``CUSTOM_DIAGRAM_CASES`` below.
2) Or set ``AR_METRICS_DATASET`` to a JSON file containing ``cases``.

Example JSON file:
{
  "cases": [
    {
      "name": "diagram_1",
      "image_path": "static/uploads/example.png",
      "actual_components": 8,
      "count_tolerance": 2,
      "expected_labels": ["cpu", "ram"]
    }
  ]
}

Run:
``pytest tests/test_ar_metrics.py -s``

Artifacts:
- ``tests/artifacts/ar_metrics_report.json``
- ``tests/artifacts/ar_metrics_cases.csv``
"""

from __future__ import annotations

import csv
import json
import os
import time
from math import sqrt
from pathlib import Path
from statistics import mean, median

import pytest

pytestmark = pytest.mark.timeout(0)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
UPLOADS_ROOT = (BACKEND_ROOT / "static" / "uploads").resolve()
ARTIFACT_DIR = BACKEND_ROOT / "tests" / "artifacts"
REPORT_JSON_PATH = ARTIFACT_DIR / "ar_metrics_report.json"
REPORT_CSV_PATH = ARTIFACT_DIR / "ar_metrics_cases.csv"


CUSTOM_DIAGRAM_CASES = [
    {
        "name": "diagram_1",
        "image_path": "/dcs/23/u2287990/IBM_Project/IBM_Project/backend/static/uploads/a7259ffeb4694da78663415b08f64221_extracted/page5_img1.png",
        "actual_components": 6,
    },
    {
        "name": "diagram_2",
        "image_path": "/dcs/23/u2287990/IBM_Project/IBM_Project/backend/static/uploads/a7259ffeb4694da78663415b08f64221_extracted/page13_img1.png",
        "actual_components": 10,
    },
    {
        "name": "diagram_3",
        "image_path": "/dcs/23/u2287990/IBM_Project/IBM_Project/backend/static/uploads/a7259ffeb4694da78663415b08f64221_extracted/page14_img1.png",
        "actual_components": 14,
    },
    {
        "name": "diagram_4",
        "image_path": "/dcs/23/u2287990/IBM_Project/IBM_Project/backend/static/uploads/a7259ffeb4694da78663415b08f64221_extracted/page15_img1.png",
        "actual_components": 8,
    },
    {
        "name": "diagram_5",
        "image_path": "/dcs/23/u2287990/IBM_Project/IBM_Project/backend/static/uploads/2dfdd42931b946e7a0763c7dc497ca96.png",
        "actual_components": 20,
    },
    {
        "name": "diagram_6",
        "image_path": "/dcs/23/u2287990/IBM_Project/IBM_Project/backend/static/uploads/3b57c8e5941a461e893d664f466fcbe0.png",
        "actual_components": 8,
    },
]


def _safe_float(v, default=0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return float(default)


def _pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = int(round((len(sorted_vals) - 1) * p))
    idx = min(max(idx, 0), len(sorted_vals) - 1)
    return float(sorted_vals[idx])


def _latency_stats(values: list[float]) -> dict[str, float]:
    if not values:
        return {
            "count": 0,
            "mean_sec": 0.0,
            "median_sec": 0.0,
            "p90_sec": 0.0,
            "p95_sec": 0.0,
            "max_sec": 0.0,
        }
    return {
        "count": len(values),
        "mean_sec": mean(values),
        "median_sec": median(values),
        "p90_sec": _pct(values, 0.90),
        "p95_sec": _pct(values, 0.95),
        "max_sec": max(values),
    }


class TestARServiceMetrics:
    @pytest.fixture(autouse=True)
    def setup_service(self, manager):
        if manager.ar_model is None:
            pytest.skip("SAM model not loaded")

        from app.services.ar_service import ar_service

        self.ar_service = ar_service

    def _resolve_image_path(self, value: str) -> Path:
        p = Path(value)
        return p if p.is_absolute() else (BACKEND_ROOT / p)

    def _load_cases(self) -> list[dict]:
        dataset_path = os.environ.get("AR_METRICS_DATASET", "").strip()
        cases = CUSTOM_DIAGRAM_CASES

        if dataset_path:
            raw_path = Path(dataset_path)
            if not raw_path.is_absolute():
                raw_path = BACKEND_ROOT / raw_path
            if not raw_path.exists():
                pytest.fail(f"AR_METRICS_DATASET file not found: {raw_path}")

            payload = json.loads(raw_path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                cases = payload.get("cases", [])
            elif isinstance(payload, list):
                cases = payload
            else:
                pytest.fail("AR_METRICS_DATASET must be a JSON object with 'cases' or a JSON list")

        if not isinstance(cases, list) or not cases:
            pytest.fail("No metric cases configured. Provide CUSTOM_DIAGRAM_CASES or AR_METRICS_DATASET.")

        validated = []
        for i, case in enumerate(cases, start=1):
            if not isinstance(case, dict):
                pytest.fail(f"case {i}: must be a JSON object")

            name = str(case.get("name") or f"case_{i}")
            image_path = case.get("image_path")
            actual = case.get("actual_components")
            expected_labels = case.get("expected_labels") or []

            if not isinstance(image_path, str) or not image_path.strip():
                pytest.fail(f"case {i} ({name}): image_path must be a non-empty string")
            if not isinstance(actual, int) or actual < 0:
                pytest.fail(f"case {i} ({name}): actual_components must be a non-negative integer")
            if not isinstance(expected_labels, list) or not all(isinstance(x, str) for x in expected_labels):
                pytest.fail(f"case {i} ({name}): expected_labels must be a list of strings")

            tolerance = case.get("count_tolerance")
            if tolerance is None:
                tolerance = max(1, round(actual * 0.20))
            if not isinstance(tolerance, int) or tolerance < 0:
                pytest.fail(f"case {i} ({name}): count_tolerance must be a non-negative integer")

            validated.append(
                {
                    "name": name,
                    "image_path": image_path,
                    "actual_components": actual,
                    "expected_labels": expected_labels,
                    "count_tolerance": tolerance,
                }
            )

        return validated

    def _count_metrics(self, detected: int, actual: int) -> dict[str, float]:
        tp = min(detected, actual)
        fp = max(0, detected - actual)
        fn = max(0, actual - detected)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
        accuracy = tp / (tp + fp + fn) if (tp + fp + fn) > 0 else 0.0

        abs_error = abs(detected - actual)
        rel_error = abs_error / max(actual, 1)

        return {
            "tp_proxy": float(tp),
            "fp_proxy": float(fp),
            "fn_proxy": float(fn),
            "precision_proxy": precision,
            "recall_proxy": recall,
            "f1_proxy": f1,
            "accuracy_proxy": accuracy,
            "abs_error": float(abs_error),
            "rel_error": rel_error,
        }

    def _component_schema_quality(self, components: list[dict]) -> tuple[float, float]:
        if not components:
            return 0.0, 0.0

        required = {"id", "x", "y", "width", "height", "confidence", "label"}
        field_ok = 0
        geo_ok = 0

        for comp in components:
            keys = set(comp.keys()) if isinstance(comp, dict) else set()
            if required.issubset(keys):
                field_ok += 1

            x = _safe_float(comp.get("x", -1.0))
            y = _safe_float(comp.get("y", -1.0))
            w = _safe_float(comp.get("width", -1.0))
            h = _safe_float(comp.get("height", -1.0))
            conf = _safe_float(comp.get("confidence", -1.0))
            if 0.0 <= x <= 1.0 and 0.0 <= y <= 1.0 and 0.0 < w <= 1.0 and 0.0 < h <= 1.0 and conf >= 0.0:
                geo_ok += 1

        n = len(components)
        return field_ok / n, geo_ok / n

    def _label_metrics(self, components: list[dict], expected_labels: list[str]) -> dict[str, float | int]:
        expected = {x.strip().lower() for x in expected_labels if x.strip()}
        if not expected:
            return {
                "label_eval_enabled": 0,
                "expected_label_count": 0,
                "detected_unique_label_count": 0,
                "label_precision": 0.0,
                "label_recall": 0.0,
                "label_f1": 0.0,
            }

        detected = {
            str(c.get("label", "")).strip().lower()
            for c in components
            if str(c.get("label", "")).strip()
        }
        matches = expected.intersection(detected)

        precision = len(matches) / len(detected) if detected else 0.0
        recall = len(matches) / len(expected) if expected else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        return {
            "label_eval_enabled": 1,
            "expected_label_count": len(expected),
            "detected_unique_label_count": len(detected),
            "label_precision": precision,
            "label_recall": recall,
            "label_f1": f1,
        }

    def _route_payload_for(self, image_path: Path) -> dict | None:
        try:
            image_path.resolve().relative_to(UPLOADS_ROOT)
        except ValueError:
            return None
        return {"file_path": str(image_path.resolve()), "use_vision": False}

    def test_ar_metrics_report(self, client):
        cases = self._load_cases()

        rows = []
        service_latencies = []
        route_latencies = []
        sq_errors = []
        route_attempts = 0
        route_successes = 0
        service_successes = 0
        non_empty_detections = 0
        within_tol_count = 0

        for case in cases:
            name = case["name"]
            path = self._resolve_image_path(case["image_path"])
            actual = int(case["actual_components"])
            tolerance = int(case["count_tolerance"])

            if not path.exists():
                pytest.fail(f"Image path not found for {name}: {path}")

            service_error = ""
            service_ok = False
            service_components = []
            t0 = time.perf_counter()
            try:
                service_result = self.ar_service.extract_document_features(str(path))
                if isinstance(service_result, dict) and isinstance(service_result.get("components"), list):
                    service_ok = True
                    service_components = service_result.get("components", [])
            except Exception as exc:  # pragma: no cover - explicit metrics capture
                service_error = str(exc)
            service_dt = time.perf_counter() - t0
            service_latencies.append(service_dt)

            if service_ok:
                service_successes += 1

            detected = len(service_components)
            if detected > 0:
                non_empty_detections += 1

            count_m = self._count_metrics(detected, actual)
            sq_errors.append((detected - actual) ** 2)
            if count_m["abs_error"] <= tolerance:
                within_tol_count += 1

            field_quality, geometry_quality = self._component_schema_quality(service_components)
            avg_conf = mean(_safe_float(c.get("confidence", 0.0)) for c in service_components) if service_components else 0.0
            label_m = self._label_metrics(service_components, case.get("expected_labels", []))

            route_payload = self._route_payload_for(path)
            route_status = "not_run"
            route_http_status = 0
            route_component_count = 0
            route_error = ""
            route_dt = 0.0
            if route_payload:
                route_attempts += 1
                t1 = time.perf_counter()
                resp = client.post(
                    "/api/ar/generate",
                    json=route_payload,
                )
                route_dt = time.perf_counter() - t1
                route_latencies.append(route_dt)

                route_http_status = int(resp.status_code)
                body = resp.get_json(silent=True) or {}
                route_status = str(body.get("status", "error"))
                route_component_count = int(body.get("componentCount", 0)) if isinstance(body, dict) else 0
                if resp.status_code == 200 and route_status == "success":
                    route_successes += 1
                else:
                    route_error = str(body.get("error", "unknown route failure"))

            row = {
                "name": name,
                "image_path": str(path),
                "actual_components": actual,
                "count_tolerance": tolerance,
                "service_ok": int(service_ok),
                "service_error": service_error,
                "service_latency_sec": service_dt,
                "detected_components": detected,
                "mean_confidence": avg_conf,
                "schema_required_fields_ratio": field_quality,
                "schema_geometry_ratio": geometry_quality,
                "count_within_tolerance": int(count_m["abs_error"] <= tolerance),
                "route_ran": int(route_payload is not None),
                "route_http_status": route_http_status,
                "route_status": route_status,
                "route_latency_sec": route_dt,
                "route_component_count": route_component_count,
                "route_error": route_error,
                **count_m,
                **label_m,
            }
            rows.append(row)

        total_cases = len(rows)
        abs_errors = [r["abs_error"] for r in rows]
        rel_errors = [r["rel_error"] for r in rows]

        tp_total = sum(r["tp_proxy"] for r in rows)
        fp_total = sum(r["fp_proxy"] for r in rows)
        fn_total = sum(r["fn_proxy"] for r in rows)
        micro_precision = tp_total / (tp_total + fp_total) if (tp_total + fp_total) > 0 else 0.0
        micro_recall = tp_total / (tp_total + fn_total) if (tp_total + fn_total) > 0 else 0.0
        micro_f1 = (
            2 * micro_precision * micro_recall / (micro_precision + micro_recall)
            if (micro_precision + micro_recall) > 0
            else 0.0
        )

        rmse = sqrt(mean(sq_errors)) if sq_errors else 0.0
        total_service_time = sum(service_latencies)

        aggregate = {
            "cases": total_cases,
            "service_success_rate": service_successes / total_cases,
            "route_coverage_rate": (route_attempts / total_cases) if total_cases else 0.0,
            "route_success_rate": (route_successes / route_attempts) if route_attempts else 0.0,
            "detection_non_empty_rate": non_empty_detections / total_cases,
            "count_within_tolerance_rate": within_tol_count / total_cases,
            "actual_total": int(sum(r["actual_components"] for r in rows)),
            "detected_total": int(sum(r["detected_components"] for r in rows)),
            "mean_abs_error": mean(abs_errors),
            "mean_rel_error": mean(rel_errors),
            "rmse": rmse,
            "mean_precision_proxy": mean(r["precision_proxy"] for r in rows),
            "mean_recall_proxy": mean(r["recall_proxy"] for r in rows),
            "mean_f1_proxy": mean(r["f1_proxy"] for r in rows),
            "mean_accuracy_proxy": mean(r["accuracy_proxy"] for r in rows),
            "micro_precision_proxy": micro_precision,
            "micro_recall_proxy": micro_recall,
            "micro_f1_proxy": micro_f1,
            "mean_confidence": mean(r["mean_confidence"] for r in rows),
            "mean_schema_required_fields_ratio": mean(r["schema_required_fields_ratio"] for r in rows),
            "mean_schema_geometry_ratio": mean(r["schema_geometry_ratio"] for r in rows),
            "service_latency": _latency_stats(service_latencies),
            "route_latency": _latency_stats(route_latencies),
            "throughput_images_per_sec": (total_cases / total_service_time) if total_service_time > 0 else 0.0,
        }

        ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
        REPORT_JSON_PATH.write_text(
            json.dumps({"aggregate": aggregate, "cases": rows}, indent=2),
            encoding="utf-8",
        )

        with REPORT_CSV_PATH.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

        print("\n=== AR Metrics Benchmark ===")
        print(f"cases={aggregate['cases']}")
        print(f"service_success_rate={aggregate['service_success_rate']:.3f}")
        print(f"route_coverage_rate={aggregate['route_coverage_rate']:.3f}")
        print(f"route_success_rate={aggregate['route_success_rate']:.3f}")
        print(f"count_within_tolerance_rate={aggregate['count_within_tolerance_rate']:.3f}")
        print(f"mean_abs_error={aggregate['mean_abs_error']:.3f}")
        print(f"rmse={aggregate['rmse']:.3f}")
        print(f"mean_f1_proxy={aggregate['mean_f1_proxy']:.3f}")
        print(f"throughput_images_per_sec={aggregate['throughput_images_per_sec']:.3f}")
        print(f"service_latency_mean_sec={aggregate['service_latency']['mean_sec']:.3f}")
        print(f"service_latency_p95_sec={aggregate['service_latency']['p95_sec']:.3f}")
        print(f"route_latency_mean_sec={aggregate['route_latency']['mean_sec']:.3f}")
        print(f"route_latency_p95_sec={aggregate['route_latency']['p95_sec']:.3f}")
        print(f"Saved JSON report: {REPORT_JSON_PATH}")
        print(f"Saved CSV report: {REPORT_CSV_PATH}")

        assert REPORT_JSON_PATH.exists()
        assert REPORT_CSV_PATH.exists()
