import os
import sys
import logging

# ============================================================
# 1. ENVIRONMENT CONFIGURATION
# Must be set BEFORE any imports that trigger model loading
# ============================================================

# os.environ['HF_HOME'] = r'G:\AI_Models'
os.environ['GRANITE_MOCK'] = "0"

# ============================================================
# 2. IMPORT APP FACTORY
# ============================================================

from app.app import create_app

# ============================================================
# 3. CREATE APP INSTANCE
# Triggers model loading immediately
# ============================================================

app = create_app()

# ============================================================
# 4. ENTRY POINT
# ============================================================

if __name__ == '__main__':
    port = int(os.getenv('PORT', '4200'))
    is_mock = os.environ.get("GRANITE_MOCK") == "1"
    is_debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'

    print("\n" + "=" * 60)
    print("🚀  STARTING SERVER")
    print("=" * 60)
    print(f"   Port     : {port}")
    print(f"   Mode     : {'🔵 MOCK (No AI)' if is_mock else '🟢 REAL AI'}")
    print(f"   Debug    : {'✅ ON' if is_debug else '❌ OFF'}")
    print(f"   Reloader : ❌ OFF (Prevents double model loading)")
    print("=" * 60)

    # use_reloader=False prevents models loading twice (saves RAM)
    app.run(
        host='0.0.0.0',
        port=port,
        debug=is_debug,
        use_reloader=False
    )