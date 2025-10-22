from vllm import LLM, SamplingParams
from vllm.assets.image import ImageAsset
from huggingface_hub import hf_hub_download
from PIL import Image

model_path = "ibm-granite/granite-vision-3.3-2b"

model = LLM(
    model=model_path
)

sampling_params = SamplingParams(
    temperature=0.7,
    max_tokens=1024
)