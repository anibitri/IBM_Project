"""Quantitative evaluation for Legacy AR (ARv1) on 6 custom diagrams.

This file is report-oriented, not threshold-gated. It prints and exports
metrics so you can compare algorithm versions without pass/fail policies.

How to use:
1) Fill in exactly 6 entries in ``CUSTOM_DIAGRAM_CASES``.
2) For each entry set:
   - ``image_path``: absolute or backend-relative path
   - ``actual_components``: your ground-truth count
3) Run:
   ``python -m pytest tests/test_ar_metrics.py -s``

Output:
- Per-diagram: count metrics, precision/recall/F1 proxies, quality proxy, runtime
- Aggregate: mean metrics over all 6 diagrams
- JSON report: ``backend/tests/artifacts/ar_metrics_report.json``
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from statistics import mean

import pytest

# This module is intentionally long-running for full metrics collection.
# Disable pytest-timeout for these report-style tests.
pytestmark = pytest.mark.timeout(0)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
REPORT_PATH = BACKEND_ROOT / "tests" / "artifacts" / "ar_metrics_report.json"


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


class TestARServiceMetrics:
    _cache: dict[str, tuple[list[dict], float]] = {}

    @pytest.fixture(autouse=True)
    def setup_service(self, manager):
        if manager.ar_model is None:
            pytest.skip("SAM model not loaded")

        from app.services.ARv1 import ar_service

        self.ar_service = ar_service

    def _resolve_image_path(self, value: str) -> Path:
        p = Path(value)
        if p.is_absolute():
            return p
        return BACKEND_ROOT / p

    def _extract_with_timing(self, image_path: str) -> tuple[list[dict], float]:
        if image_path not in self._cache:
            t0 = time.perf_counter()
            components = self.ar_service.extract_document_features(image_path)
            dt = time.perf_counter() - t0
            self._cache[image_path] = (components, dt)
        return self._cache[image_path]

    def _validate_case_config(self):
        if len(CUSTOM_DIAGRAM_CASES) != 6:
            pytest.fail("Configure exactly 6 diagram cases in CUSTOM_DIAGRAM_CASES.")

        issues = []
        for idx, case in enumerate(CUSTOM_DIAGRAM_CASES, start=1):
            name = str(case.get("name", f"diagram_{idx}"))
            image_path = case.get("image_path")
            actual = case.get("actual_components")

            if not isinstance(image_path, str) or not image_path.strip():
                issues.append(f"case {idx} ({name}): image_path is empty")

            if not isinstance(actual, int) or actual < 0:
                issues.append(
                    f"case {idx} ({name}): actual_components must be a non-negative int"
                )

        if issues:
            joined = "\n".join(f"- {x}" for x in issues)
            pytest.fail(
                "CUSTOM_DIAGRAM_CASES config issues:\n" + joined
            )

    def _quality_proxy(self, components: list[dict]) -> float:
        """Measure how many outputs look like valid components."""
        if not components:
            return 0.0

        valid = 0
        for comp in components:
            x = float(comp.get("x", -1))
            y = float(comp.get("y", -1))
            w = float(comp.get("width", -1))
            h = float(comp.get("height", -1))
            conf = float(comp.get("confidence", -1))
            area = w * h

            in_bounds = (
                0.0 <= x <= 1.0
                and 0.0 <= y <= 1.0
                and 0.0 < w <= 1.0
                and 0.0 < h <= 1.0
            )
            non_background_size = area < 0.90
            confidence_present = conf >= 0.10

            if in_bounds and non_background_size and confidence_present:
                valid += 1

        return valid / len(components)

    def _count_metrics(self, detected: int, actual: int) -> dict[str, float]:
        """Count-only proxies for precision/recall/F1/accuracy."""
        tp = min(detected, actual)
        fp = max(0, detected - actual)
        fn = max(0, actual - detected)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0

        # Detection accuracy proxy over component-count events.
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

    def test_legacy_ar_metrics_report(self):
        """Run full quantitative evaluation and emit a report (non-gating)."""
        self._validate_case_config()

        rows = []
        for case in CUSTOM_DIAGRAM_CASES:
            name = str(case["name"])
            img_path = self._resolve_image_path(str(case["image_path"]))
            actual = int(case["actual_components"])

            if not img_path.exists():
                pytest.fail(f"Image path not found for {name}: {img_path}")

            components, dt = self._extract_with_timing(str(img_path))
            detected = len(components)

            cm = self._count_metrics(detected, actual)
            quality = self._quality_proxy(components)
            conf_mean = mean(float(c.get("confidence", 0.0)) for c in components) if components else 0.0

            row = {
                "name": name,
                "path": str(img_path),
                "actual": actual,
                "detected": detected,
                "runtime_sec": dt,
                "quality_proxy": quality,
                "mean_confidence": conf_mean,
                **cm,
            }
            rows.append(row)

        aggregate = {
            "cases": len(rows),
            "actual_total": int(sum(r["actual"] for r in rows)),
            "detected_total": int(sum(r["detected"] for r in rows)),
            "mean_abs_error": mean(r["abs_error"] for r in rows),
            "mean_rel_error": mean(r["rel_error"] for r in rows),
            "mean_precision_proxy": mean(r["precision_proxy"] for r in rows),
            "mean_recall_proxy": mean(r["recall_proxy"] for r in rows),
            "mean_f1_proxy": mean(r["f1_proxy"] for r in rows),
            "mean_accuracy_proxy": mean(r["accuracy_proxy"] for r in rows),
            "mean_quality_proxy": mean(r["quality_proxy"] for r in rows),
            "mean_confidence": mean(r["mean_confidence"] for r in rows),
            "avg_runtime_sec": mean(r["runtime_sec"] for r in rows),
            "worst_runtime_sec": max(r["runtime_sec"] for r in rows),
        }

        print("\n=== Legacy AR Quantitative Report (6 diagrams) ===")
        for r in rows:
            print(
                f"- {r['name']}: actual={r['actual']}, detected={r['detected']}, "
                f"abs_err={r['abs_error']:.0f}, rel_err={r['rel_error']:.3f}, "
                f"precision={r['precision_proxy']:.3f}, recall={r['recall_proxy']:.3f}, "
                f"f1={r['f1_proxy']:.3f}, acc={r['accuracy_proxy']:.3f}, "
                f"quality={r['quality_proxy']:.3f}, conf={r['mean_confidence']:.3f}, "
                f"runtime={r['runtime_sec']:.2f}s"
            )
            print(f"  path: {r['path']}")

        print("\n--- Aggregate ---")
        for k, v in aggregate.items():
            if isinstance(v, float):
                print(f"{k}: {v:.4f}")
            else:
                print(f"{k}: {v}")

        REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
        REPORT_PATH.write_text(
            json.dumps({"aggregate": aggregate, "cases": rows}, indent=2),
            encoding="utf-8",
        )
        print(f"\nSaved JSON report: {REPORT_PATH}")

        # Non-gating test: always pass once report generation completes.
        assert True
