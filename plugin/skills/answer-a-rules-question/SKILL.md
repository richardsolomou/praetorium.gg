---
name: answer-a-rules-question
description: Answer a Warhammer 40,000 rules question from Praetorium's reference, citing the source. Use when someone asks how a rule, ability, stratagem, keyword, datasheet value or mission works.
---

# Answer a rules question

1. Call `search_reference` with the rule, ability, unit or number the question names. Add a `faction`, `pack` or `document` filter when the name could mean more than one thing, and ask the player when it still does.
2. Read the best result with `get_reference`, or `get_reference_record` for structured values such as a datasheet's profiles or a mission's scoring.
3. Praetorium gives names, numbers and links, never rules text. When the answer depends on the exact wording, fetch the `textSources` the record lists and read the wording there.
4. Answer from what you read, and link the canonical URL. Keep the result's attribution.

Never answer a rules question from memory, and never fill a gap the source leaves. If the records don't settle the question, say so and link what you read. Points and datasheet values change with each update; if the player asks what changed, call `list_data_updates`.
