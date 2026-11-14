---
name: Koti
description: A calm, playful workspace for learning about a first home.
colors:
  ink: "#203d31"
  forest: "#183f32"
  green: "#387c36"
  lime: "#d7ef9d"
  paper: "#fbfcf8"
  muted: "#617064"
  line: "#e2e7dc"
  lilac: "#e9e0f4"
  peach: "#f8e3d4"
  surface: "#fffefa"
  white: "#ffffff"
  lesson-surface: "#eaf1de"
  green-hover: "#2b652b"
  secondary: "#eef2e8"
  secondary-hover: "#e1ead9"
  focus: "#739b47"
typography:
  display:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "35px"
    fontWeight: 750
    lineHeight: 1.4
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "29px"
    fontWeight: 750
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 750
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  subtitle:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 750
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  financial-context:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.65
  input:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
  button:
    fontFamily: "Manrope, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.4
rounded:
  "field": "8px"
  "control": "9px"
  "compact-panel": "12px"
  "learning-panel": "14px"
  "panel": "16px"
  "dialog": "18px"
  "circle": "50%"
spacing:
  "4": "4px"
  "8": "8px"
  "12": "12px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "26": "26px"
  "30": "30px"
  "32": "32px"
  "40": "40px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-primary-hover:
    backgroundColor: "{colors.green-hover}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "12px 20px"
  button-secondary-hover:
    backgroundColor: "{colors.secondary-hover}"
  button-text:
    textColor: "{colors.green}"
    padding: "4px 0"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
  nav-active:
    backgroundColor: "{colors.lime}"
    textColor: "#234b31"
    rounded: "{rounded.control}"
    padding: "10px 16px"
  chip:
    backgroundColor: "#edf2e3"
    textColor: "#5d6e41"
    rounded: "5px"
    padding: "3px 8px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "23px"
  plan-panel:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "26px"
---
# Design System: Koti

## Overview

**Creative North Star: "Little steps, closer to home"**

Koti uses forest navigation, a warm white workspace and green actions to make money decisions feel calm and approachable. Manrope provides a rounded, geometric voice; lilac and peach add playfulness to lessons without competing with financial information. The repeated home motif connects the brand mark, illustration and learning milestones.

The interface is compact but readable. Soft panels separate activities, while rules and aligned numbers make evidence inspectable. Learning rewards belong to the learning path; financial amounts retain their own labels and tabular figures. This records the implemented visual system, not a claim of bank endorsement or a completed design-process certification.

**Key Characteristics:**

- Forest navigation and warm, lightly bordered surfaces.
- Rounded geometric typography with prominent, aligned money figures.
- Pastel learning diagrams and a recurring home motif.
- Short state transitions, visible focus and reduced-motion support.

The source of truth for this scan is `app/globals.css`, including its final readability overrides, and `components/koti-app.tsx`. The direction is recorded in `PRODUCT.md` and `.impeccable/surfaces/home.md`. No concept-seed procedure ran; no seeded-world provenance or full workflow pass is asserted here. Live AI integration is explicitly deferred and is not a visual-system capability.

## Colors

A dark green frame surrounds warm white content, with calm green actions and pale learning accents. The frontmatter owns exact color values. Sidecar tonal ramps are synthesized panel previews, not additional implemented palette tokens.

### Primary

- **Action Green** (`green`): primary buttons, slider accent, selected input controls, learning progress and forecast line.
- **Forest** (`forest`): persistent desktop navigation, dark feedback surfaces and input caret.
- **Lime** (`lime`): active desktop navigation, text selection and completion accents.
- **Deep Action Green** (`green-hover`): primary button hover.

### Secondary

- **Learning Lilac** (`lilac`): flexible-spending markers and learning-path nodes.
- **Learning Peach** (`peach`): irregular-spending markers and learning-path nodes.

### Neutral

- **Forest Ink** (`ink`): principal text and financial amounts.
- **Warm Paper** (`paper`): page and dialog background.
- **Warm Surface** (`surface`): topbar, fields, home-goal card and mobile navigation.
- **White** (`white`): primary action text and analytical panels.
- **Muted Sage** (`muted`): supporting explanations and metadata.
- **Soft Divider** (`line`): panel boundaries, table rules and separators.
- **Learning Wash** (`lesson-surface`): illustrated lesson and plan introduction surfaces.
- **Secondary Wash** (`secondary`) and **Secondary Hover** (`secondary-hover`): secondary button states.
- **Focus Olive** (`focus`): keyboard outline.

**The Meaning Before Colour Rule.** Pair financial and learning states with words, amounts or icons; colour alone does not carry the answer.

## Typography

**Display Font:** Manrope, with Arial and sans-serif fallbacks.
**Body Font:** Manrope, using the bundled variable font.

**Character:** Rounded geometric letterforms soften an otherwise practical, compact application. Heavy headings use slightly tightened tracking; prose keeps normal spacing and a generous line-height. Paragraphs are capped at 70ch.

### Hierarchy

- **Display:** the main money figure uses the `display` role, with responsive variants of 31px and 36px. The wordmark is a separate 40px/800 identity treatment, reduced to 27px on mobile.
- **Headline:** page headings use `headline`; compact viewports use 25px. Illustrated lesson headings vary from 25px to 32px by breakpoint.
- **Title:** section and dialog headings use `title`; smaller section headings use 15–17px. Lesson questions use 20–21px.
- **Subtitle:** the base third-level heading uses `subtitle`; compact card titles are smaller.
- **Body:** explanatory lesson, coaching, dialog and scenario prose uses `body` after the final stylesheet overrides.
- **Financial context:** reserve explanations, important footnotes and field hints use `financial-context`; inherited local line-height may be 1.6–1.8.
- **Label:** compact supporting labels and metadata use 12px, with weight determined by hierarchy; field labels use the `label` role. Financial explanations are not metadata.
- **Input:** editable field and composer text use `input`. Tables still contain compact 12px selectors; that exception is not a general input rule.
- **Button:** primary and secondary actions use `button`, with specific compact variants at 12px.

Money figures use `font-variant-numeric: tabular-nums`. The chart's SVG text is 20 units inside a 600-unit viewBox; that is a rendering detail, not a 20px prose token.

**The Readable Context Rule.** Keep financial explanations at the implemented 13px context size or 14px body size; reserve 12px for supporting labels and metadata.

## Layout

Desktop uses a fixed 228px navigation rail and an offset workspace. The topbar is 80px tall; main content has a 1530px maximum width and 36px/40px/20px padding. The primary workspace and 280px supporting column are separated by 30px. Content panels commonly use 20–32px internal space, with smaller 4–16px gaps for related controls. These are observed steps, not a strict mathematical spacing scale.

At 1600px and above, main horizontal padding increases to 60px, the supporting column to 310px and its gap to 38px. At 1250px and below, the rail becomes 200px, horizontal content padding 28px and the supporting column 245px. At 1050px and below, the primary workspace becomes one column and supporting content uses a two-column row.

At 740px and below, the rail disappears. A sticky 65px topbar and fixed 76px bottom navigation frame a single column with 20px horizontal padding and 105px bottom clearance. Supporting content stacks. Mobile dialogs use almost the full width with 12px side gutters, and dialog form grids become one column. Evidence tables remain horizontally scrollable; their mobile minimum width is 570px.

## Elevation & Depth

Ordinary content is flat, separated by pale fills and thin rules. Illustration gives the lesson areas their dimensional character. Shadows belong to temporary overlays, with an opaque dark translucent backdrop establishing modal depth.

### Shadow Vocabulary

- **Dialog:** `0 24px 90px #152a3440` supports a modal above the workspace.
- **Status toast:** `0 8px 25px #183f3225` separates temporary feedback from content.
- **Dialog backdrop:** `#11241cc2` dims the background without a blur effect.

**The Quiet Surface Rule.** Keep content panels flat. Reserve cast shadows for dialogs and transient status feedback.

## Shapes

The base panel radius is `panel`; fields use `field` and action controls use `control`. Compact invitations use `compact-panel`, lesson diagrams use `learning-panel`, and desktop dialogs use `dialog`. Mobile dialogs reduce to the learning-panel radius. Circular progress nodes, avatars and icon accents contrast with rounded rectangular containers. Dividers are usually 1px; learning-path connections use a dotted line. SVG outline icons provide the shared symbol vocabulary.

## Components

### Buttons

Confident, compact actions pair a verbal label with an optional SVG arrow.

- Primary and secondary colors, radii and padding are defined in frontmatter. The standard minimum height is 46px.
- Primary hover deepens the green; secondary hover deepens its wash. Press scales the standard button to 0.98. Background and transform transition for 150ms with `ease`.
- Text actions are green, 12px/750 and at least 44px tall after the final override. Hover underlines the label.
- Icon actions are transparent with rounded corners and at least 42px dimensions in their base form; mobile variants may be smaller.
- Disabled buttons use 0.5 opacity and a not-allowed cursor. Keyboard focus uses a 3px olive outline offset by 4px. Reduced motion removes standard button transitions.

### Chips

Small, quiet context labels use pale fills, 5px rounding and compact padding. The implemented chips are informational; they are not a filter system. The separate XP button is an interactive status control with a 7px radius and clear focus behavior.

### Cards / Containers

Warm home-goal cards and white analytical panels use the shared panel radius, a soft divider border and no shadow. Home-goal cards have 23px desktop padding; plan panels use 26px. Illustrated introductions use the learning wash and overflow clipping. Home imagery remains supporting content, with text and controls above its stacking layer.

### Inputs / Fields

Fields are warm, bordered, rounded rectangles with a label above and optional explanatory text below. Standard fields use 43px minimum height, rising to 44px on mobile. Input text remains 16px after all breakpoint rules. Keyboard focus uses the shared outline.

Money fields include an inset currency marker and tabular figures. They preserve a local draft while typing; blur or Enter commits the bounded amount. Range controls use the green accent with nearby live value labels. Checkbox and radio choices retain native input semantics. No independent invalid-input border system is established by the current code; warnings appear in labelled contextual feedback instead.

### Navigation

The forest rail carries muted light labels, SVG symbols and a lime active destination. Hover uses a lighter forest surface; active state also has heavier text and `aria-current`. On mobile, a warm bottom bar replaces the rail, placing the icon above the label and using a pale green selected background. Today, Coach and My plan share the same structure.

### Dialogs and Feedback

Native dialogs have a sticky header, labelled title, close control and scrollable body. Standard width is bounded at 600px and evidence dialogs at 1000px; both respect viewport gutters. Toasts use forest with white text and enter over 180ms. Lesson reward feedback uses a brief 280ms scale/opacity animation. Both animations use the shared ease curve and are removed for reduced motion.

### Learning diagrams and progress

Allocation diagrams place labelled amounts in adjacent rounded blocks. A reserve slider changes the relative widths and the displayed room amount together. Colors distinguish rent, reserve and remaining room; text and SVG symbols supply the meaning. The dotted learning path uses colored circular nodes, replacing completed nodes with green and a check. Financial progress bars and lesson XP remain separate presentations.

Forecast charts draw an unfilled green cash line against a dashed reserve line, with nearby labels and a textual accessible description. Payday text follows the first forecast point containing income. A forecast illustration never represents a completed transfer.

## Do's and Don'ts

### Do:

- Do use the shared Manrope face and tabular figures for money.
- Do keep meaningful labels and explanatory text beside diagrams, forecasts and progress.
- Do preserve the forest, green and warm-paper relationship, using lilac and peach for learning and category distinctions.
- Do retain visible keyboard focus, native control semantics and reduced-motion behavior.
- Do stack the workspace and expose bottom navigation at the mobile breakpoint.

### Don't:

- Don't replace financial context with tiny metadata styling.
- Don't imply that XP is money or that an illustrative forecast is a completed transfer.
- Don't add shadows to ordinary content cards.
- Don't use decorative glyphs instead of the implemented SVG icon language.
