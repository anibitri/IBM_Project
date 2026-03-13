# Prompt Builder Report (`prompt_builder.py`)

## Overview
`prompt_builder.py` centralizes prompt templates and response post-processing utilities used by AR and vision flows.

## Core Responsibilities
- Provide prompt templates for:
  - single-component labeling (`COMPONENT_LABEL_PROMPT`)
  - connection extraction (`CONNECTION_PROMPT_TEMPLATE`)
  - whole-diagram component extraction (`AR_EXTRACTION_PROMPT`)
- Normalize noisy model labels (`clean_label`).
- Build connection prompts with normalized component coordinates (`build_connection_prompt`).
- Ensure duplicate labels become unique (`make_unique_labels`).

## Public Functions
- `clean_label(raw: str) -> Optional[str]`
- `build_connection_prompt(components: List[Dict]) -> str`
- `make_unique_labels(labels: list[str]) -> list[str]`

## Dependencies
- Standard library: `re`, `typing`

## Risks / Notes
- Prompt wording has strong downstream impact on vision extraction quality.
- Label cleaning rules are heuristic and may over-normalize edge cases.
- This module is a key tuning surface and should be versioned carefully.
