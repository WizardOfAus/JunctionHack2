# First-slice extension conformance

This is an extension of Koti's established world. `DESIGN.md` and `.impeccable/design.json` remain normative and were preserved byte-for-byte. No system refresh, replacement, or new token authorization is implied by this note.

## Evidence checked

Compared `DESIGN.md`, `.impeccable/design.json`, `PRODUCT.md`, and `../docs/slices/goal-led-first-slice.md` with `app/globals.css`; the TSX and CSS Modules in `features/onboarding/`, `features/money-overview/`, and `features/learning/`; `features/integration.module.css`; and the integration/navigation/sidebar portions of `components/koti-app.tsx`. Inspected `detector.json` and the rendered `desktop.png`, `onboarding-mobile.png`, `lesson-mobile.png`, and `lesson-mobile-controls.png` in this directory. These are stored captures, not a new live interaction test.

## Retained system

- Palette: forest navigation, warm paper, green actions, lime learning emphasis, lilac protection and peach feedback retain the incumbent relationship.
- Type: inherited Manrope, tight heavy headings, tabular money figures and a readable body hierarchy remain; the normative ramp remains unchanged.
- Meaning Before Colour: amounts, diagram labels, accessible descriptions, progress labels and explanatory feedback accompany color.
- Quiet Surface: analytical and learning panels remain flat, lightly bordered and rounded; this slice adds no card shadows.
- Interaction: shared action controls and SVG icons remain; native radio/range semantics, visible focus, a 740px mobile layout and reduced-motion handling are present in source.

The overview prioritizes recorded balance, lowest forecast and protected money. The hundred-cell exercise conserves the illustrative €1,000, separates practice from the account forecast, and identifies XP as noncash. The two-step entry explicitly distinguishes a goal from the one synthetic account and offers unknown coverage. These are local product expressions of the existing system.

## Intentional local differences

The onboarding heading uses a 36–52px clamp (32px mobile); the overview amount uses a 32–49px clamp (45px mobile); lesson headings use 30px/27px; integrated page headings use 32px/27px. These local emphasis choices do not add normative type roles. The new layout stacks the overview at 1250px and hides the lesson side path at 1150px; the shared mobile navigation breakpoint stays 740px.

Diagram cells/tracks use compact 2–4px rounding. Lilac/green outlines (`#b3a3c6`, `#819c4e`), the invitation's purple miniature cells (`#89709f`), lime hover (`#cce88c`) and connection divider (`#cad7bf`) remain local accents, not additions to the global palette. The lesson's 180ms cell transition also remains local and is removed for reduced motion.

The stored detector has 33 findings: 22 type-size, six radius and five color differences, all advisory. It does not establish a new system or certify overall conformance. The finish-review handoff reports both requested hierarchy fixes resolved and a ship disposition at that fix scope. Source and the desktop capture confirm the goal section starts with its heading and the lesson invitation places duration/XP below its title.

## Drift not canonized

Existing global `--mint: #edf3e6` is absent from the normative color list, despite existing source use. The incumbent design prose and sidecar navigation preview still name Today/Coach/My plan, while the extension has Money/Learn/Coach/My plan. These documentation gaps were reported without repairing the incumbent files. The new overview's 12px bridge explanations and source note at the bottom also fall below the documented 13–14px financial-context guidance; they are not promoted into a reusable rule by this pass.

Preservation verification: SHA-256 before and after matched for `DESIGN.md` (`666b9da48dadfc08b0980cb41d46dfc58fb1a2d49af99f824b20e0de728c2341`) and `.impeccable/design.json` (`0c55a89fb0e65699c2d3a038d5c8749ec91329af0a5750c0fd3d6a8bc1c1c523`). Only this conformance note was written by the documenter; no runtime files were changed.
