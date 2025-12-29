import os
# 1. Set the path
os.environ['HF_HOME'] = r'G:\AI_Models'

# 2. Import transformers (it loads the path immediately)
from huggingface_hub import constants

print(f"\n✅ SUCCESS! Hugging Face is now using: {constants.HF_HOME}")