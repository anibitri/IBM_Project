from app import create_app
import os

# 1. This triggers the Model Loading immediately
app = create_app()

if __name__ == '__main__':
    port = int(os.getenv('PORT', '4200'))
    print(f"--- STARTING SERVER on Port {port} ---")
    
    # 2. use_reloader=False prevents crashing your RAM
    app.run(host='0.0.0.0', port=port, debug=True, use_reloader=False)