"""
conftest.py
Shared fixtures. Models load ONCE per session - no mocking.
Set GRANITE_MOCK=1 in the environment to run without GPU/models.
"""

import os
import sys
import io
import pytest
from PIL import Image, ImageDraw

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, BACKEND_ROOT)

# os.environ['HF_HOME'] = r"/dcs/large/u2287990/AI_models"
# Respect the environment variable; default to real-model mode.
# Override: GRANITE_MOCK=1 pytest  (runs without GPU — uses IBM OTel mock responses)
from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_ROOT, '.env'))

os.environ.setdefault('GRANITE_MOCK', '0')

# Disable OpenTelemetry SDK during tests — no collector is running,
# which causes constant gRPC errors and "I/O on closed file" noise
# when the OTel background thread outlives the test process.
os.environ.setdefault('OTEL_SDK_DISABLED', 'true')

API_ACCESS_TOKEN = os.environ.get('API_ACCESS_TOKEN', 'ibm-project-dev-token')


# ── Image helpers ────────────────────────────────────────────

def make_otel_diagram_png(path: str):
    """
    Draw a minimal IBM OpenTelemetry → Instana pipeline diagram.
    Matches the project's subject matter: App → OTel Collector →
    OTLP/Instana Exporter → Instana Agent → Instana.
    """
    W, H = 900, 300
    img  = Image.new("RGB", (W, H), color=(245, 247, 250))
    draw = ImageDraw.Draw(img)

    # Title bar
    draw.rectangle([0, 0, W, 30], fill=(30, 50, 80))
    draw.text((W // 2, 15), "IBM OpenTelemetry → Instana Pipeline", fill="white", anchor="mm")

    # Five component boxes with labels
    boxes = [
        (30,  80, 170, 200, (70,  130, 180), "App"),
        (210, 80, 380, 200, (60,  160,  80), "OTel\nCollector"),
        (420, 80, 590, 200, (180, 100,  60), "OTLP/Instana\nExporter"),
        (630, 80, 760, 200, (160,  60, 180), "Instana\nAgent"),
        (800, 80, 880, 200, (180,  50,  50), "Instana"),
    ]
    for (x1, y1, x2, y2, color, label) in boxes:
        draw.rectangle([x1, y1, x2, y2], fill=color, outline=(20, 20, 20), width=3)
        cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
        draw.text((cx, cy), label, fill="white", anchor="mm")

    # Connecting arrows between boxes
    arrows = [
        (170, 140, 210, 140),
        (380, 140, 420, 140),
        (590, 140, 630, 140),
        (760, 140, 800, 140),
    ]
    for (x1, y1, x2, y2) in arrows:
        draw.line([(x1, y1), (x2, y2)], fill=(40, 40, 60), width=3)
        draw.polygon([(x2, y2), (x2 - 8, y2 - 5), (x2 - 8, y2 + 5)], fill=(40, 40, 60))

    # Protocol labels
    draw.text((190, 155), "OTLP", fill=(60, 60, 90), anchor="mm")
    draw.text((400, 155), "OTLP", fill=(60, 60, 90), anchor="mm")
    draw.text((610, 155), "HTTPS", fill=(60, 60, 90), anchor="mm")
    draw.text((780, 155), "internal", fill=(60, 60, 90), anchor="mm")

    img.save(path)


def make_simple_png(path: str):
    img  = Image.new("RGB", (400, 300), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([30,  30,  180, 130], fill=(100, 149, 237), outline=(0, 0, 0), width=3)
    draw.rectangle([220, 30,  370, 130], fill=(60,  179, 113), outline=(0, 0, 0), width=3)
    draw.rectangle([100, 170, 300, 270], fill=(220, 100,  60), outline=(0, 0, 0), width=3)
    draw.line([(180, 80), (220, 80)], fill=(0, 0, 0), width=2)
    img.save(path)


def make_pdf_bytes() -> bytes:
    return (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n"
        b"xref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n"
        b"0000000058 00000 n\n0000000115 00000 n\n"
        b"trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n190\n%%EOF"
    )


# ── Session fixtures ─────────────────────────────────────────

@pytest.fixture(scope="session")
def manager():
    from app.services.model_manager import manager as mgr
    yield mgr


@pytest.fixture(scope="session")
def flask_app(manager):
    from app.app import create_app
    app = create_app()
    app.config.update({'TESTING': True, 'DEBUG': False})
    yield app


@pytest.fixture(scope="session")
def client(flask_app):
    test_client = flask_app.test_client()
    # Most API routes require a static bearer token.
    test_client.environ_base['HTTP_AUTHORIZATION'] = f'Bearer {API_ACCESS_TOKEN}'
    return test_client


@pytest.fixture(scope="session")
def unauthenticated_client(flask_app):
    return flask_app.test_client()


@pytest.fixture(scope="session")
def test_images_dir(tmp_path_factory):
    d = tmp_path_factory.mktemp("imgs")
    make_otel_diagram_png(str(d / "diagram.png"))
    make_simple_png(str(d / "simple.png"))
    large = Image.new("RGB", (5000, 4000), color=(200, 200, 210))
    large.save(str(d / "large.png"))
    tiny = Image.new("RGB", (8, 8), color=(255, 0, 0))
    tiny.save(str(d / "tiny.png"))
    (d / "document.pdf").write_bytes(make_pdf_bytes())
    (d / "corrupt.png").write_bytes(b"this is not an image")
    return d


@pytest.fixture(scope="session")
def diagram_path(test_images_dir):
    return str(test_images_dir / "diagram.png")


@pytest.fixture(scope="session")
def simple_path(test_images_dir):
    return str(test_images_dir / "simple.png")


@pytest.fixture(scope="session")
def pdf_path(test_images_dir):
    return str(test_images_dir / "document.pdf")


@pytest.fixture(scope="session")
def uploaded_diagram(client, test_images_dir):
    """Upload diagram once, reuse stored_name across all tests"""
    with open(str(test_images_dir / "diagram.png"), 'rb') as f:
        resp = client.post(
            '/api/upload/',
            data={'file': (f, 'diagram.png', 'image/png')},
            content_type='multipart/form-data'
        )
    assert resp.status_code == 200, f"Fixture upload failed: {resp.get_json()}"
    return resp.get_json()['file']['stored_name']
