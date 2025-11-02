from transformers import pipeline

global analyzer, analyzer2
print('Loading AI and Vision models...')
ai_model_id = ('ibm-granite/granite-4.0-micro')
vision_model_id = ('ibm-granite/granite-vision-3.3-2b')
# Adjust tasks as needed for your models
analyzer = pipeline('text-generation', model=ai_model_id)
print(f'Loaded AI model: {ai_model_id}')
analyzer2 = pipeline('image-to-text', model=vision_model_id)
print(f'Loaded Vision model: {vision_model_id}')
