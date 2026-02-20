"""
conftest.py
Shared fixtures. Models load ONCE per session - no mocking.
"""

import os
import sys
import io
import pytest
from PIL import Image, ImageDraw

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, BACKEND_ROOT)

os.environ['HF_HOME'] = r"/dcs/large/u2287990/AI_models"
os.environ['GRANITE_MOCK'] = '0'


# ── Image helpers ────────────────────────────────────────────

def make_diagram_png(path: str):
    img  = Image.new("RGB", (800, 600), color=(240, 240, 245))
    draw = ImageDraw.Draw(img)
    for x in range(0, 800, 40):
        draw.line([(x, 0), (x, 600)], fill=(220, 225, 235), width=1)
    for y in range(0, 600, 40):
        draw.line([(0, y), (800, y)], fill=(220, 225, 235), width=1)
    draw.rectangle([0, 0, 800, 35], fill=(50, 50, 70))
    draw.text((400, 17), "System Architecture Diagram", fill="white", anchor="mm")
    for (x1, y1, x2, y2), color, label in [
        ((80,  80,  280, 200), (70,  130, 180), "CPU"),
        ((340, 80,  520, 160), (60,  160, 80),  "RAM"),
        ((340, 180, 460, 240), (180, 100, 60),  "Cache"),
        ((560, 80,  700, 220), (160, 60,  180), "CLK"),
        ((80,  280, 300, 380), (200, 160, 40),  "Storage"),
        ((340, 280, 620, 420), (180, 50,  50),  "GPU"),
        ((80,  440, 220, 520), (80,  160, 160), "I/O"),
        ((280, 440, 480, 520), (100, 80,  180), "Network"),
    ]:
        draw.rectangle([x1, y1, x2, y2], fill=color, outline=(30, 30, 30), width=3)
        draw.text(((x1+x2)//2, (y1+y2)//2), label, fill="white", anchor="mm")
    for s, e in [((280,140),(340,120)),((190,200),(190,280)),((430,160),(480,280))]:
        draw.line([s, e], fill=(80, 80, 100), width=2)
    img.save(path)


def make_simple_png(path: str):
    img  = Image.new("RGB", (400, 300), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([30,  30,  180, 130], fill=(100, 149, 237), outline=(0,0,0), width=3)
    draw.rectangle([220, 30,  370, 130], fill=(60,  179, 113), outline=(0,0,0), width=3)
    draw.rectangle([100, 170, 300, 270], fill=(220, 100, 60),  outline=(0,0,0), width=3)
    draw.line([(180, 80), (220, 80)],   fill=(0,0,0), width=2)
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
    return flask_app.test_client()


@pytest.fixture(scope="session")
def test_images_dir(tmp_path_factory):
    d = tmp_path_factory.mktemp("imgs")
    make_diagram_png(str(d / "diagram.png"))
    make_simple_png(str(d  / "simple.png"))
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