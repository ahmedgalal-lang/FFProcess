@AGENTS.md

# Working convention: SpecKit for substantial changes

For a substantial feature or anything with real design decisions (new
capability, a change touching several files/pages, a new export format,
etc.), use the SpecKit workflow — speckit-specify, then speckit-clarify,
speckit-plan, speckit-tasks, and speckit-implement — instead of building
straight from the request.

Small fixes, copy tweaks, one-line changes, and bug fixes with an obvious
correct behavior skip SpecKit and are just made directly, as before.

When a request is ambiguous whether it counts as "substantial," ask before
choosing a path.
