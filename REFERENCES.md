# Research reference

Akash Kumar Gautam, Lukas Lange, and Jannik Strötgen. 2024.
**Discourse-Aware In-Context Learning for Temporal Expression Normalization.**
Proceedings of NAACL 2024, Volume 2: Short Papers, pages 306–315.

- Paper: https://aclanthology.org/2024.naacl-short.27/
- PDF: https://aclanthology.org/2024.naacl-short.27.pdf
- DOI: https://doi.org/10.18653/v1/2024.naacl-short.27
- Section 3: prompt context and example selection.
- Appendix C, Figures 5–6: normalization prompt examples for temporal expressions.

This library draws inspiration from the paper's use of reference dates, contextual
information, and few-shot examples for temporal normalization. The paper primarily
normalizes already identified temporal expressions; this library asks a model to
extract event fields as well as normalize them. The paper's results do not establish
accuracy for this library's combined task.

This is an independent implementation, not the authors' code or a reproduction of
their experimental pipeline. It uses original, fixed calendar examples. It does not
implement embedding-based example retrieval, their running prediction window,
TimeML tagging, or their benchmark datasets. Caller-supplied history is simply
provided as context. No paper text, research code, or dataset is bundled.

A future improvement is selecting relevant examples from a tested calendar-specific
example bank, following the motivation of the paper's target-centric approach.
