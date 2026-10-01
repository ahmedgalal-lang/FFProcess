# Feature Specification: Arabic Interface

**Feature Branch**: `031-arabic-interface`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "Can we have the option to switch to Arabic, and translate all aspects?" then "Yes, please proceed with the Arabic interface for all aspects."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Switching the interface to Arabic (Priority: P1) 🎯 MVP

A consultant working with an Arabic-speaking client needs the whole product in Arabic: menus, buttons, forms, messages, and the Governance area's guides and templates, laid out right-to-left as Arabic readers expect.

**Independent Test**: Choose العربية from the language switcher in the header. The page reloads right-to-left with Arabic text throughout the navigation and the Governance page. Choose English and it returns to left-to-right English. The choice is remembered on the next visit.

**Acceptance Scenarios**:

1. **Given** any signed-in page, **When** the user picks العربية in the header's language switcher, **Then** the interface shows in Arabic, laid out right-to-left, and stays in Arabic on every page until switched back.
2. **Given** the sign-in page, **When** a visitor has chosen Arabic before, **Then** it shows in Arabic too; it also offers the switcher.
3. **Given** Arabic, **When** viewing dates and numbers, **Then** dates use Arabic month names and digits stay Western (0–9), matching process codes such as PUR100.
4. **Given** Arabic, **When** viewing a process map, swimlane diagram or org chart, **Then** the drawing keeps its left-to-right flow (a process reads in the direction it was drawn), while its labels and surrounding controls are in Arabic.

### User Story 2 - Arabic governance content (Priority: P1)

The Governance area's built-in content is translated: the default aspect names, the section guides, the 14 policy templates, the dashboard tiles, the lifecycle states.

**Acceptance Scenarios**:

1. **Given** Arabic, **When** viewing a workspace whose aspects still have their default English names, **Then** the tabs show the Arabic names. An aspect a consultant named themselves shows as they named it.
2. **Given** Arabic, **When** starting a governing policy from a template, **Then** the Arabic template is offered and the created policy is in Arabic.
3. **Given** Arabic, **When** generating an assessment, drafting a policy with AI, or running a process review, **Then** the AI writes its output in Arabic.

### User Story 3 - Arabic exports (Priority: P2)

**Acceptance Scenarios**:

1. **Given** Arabic, **When** previewing or printing the report, **Then** it is in Arabic and right-to-left.
2. **Given** Arabic, **When** downloading the PowerPoint deck or the spreadsheets, **Then** their headings and labels are in Arabic, with right-to-left text.

### Edge Cases

- Content users type (process names, steps, risks, their own policies) is never translated; it shows as entered, whichever language is active.
- Mixed text (an Arabic sentence containing "PUR100" or an English name) keeps each run readable in its own direction.
- A language preference is per browser (a cookie), so a user on two devices may see different languages.
- An invitation or email the app sends stays in English in this version.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Every page MUST offer a language switcher (English, العربية), remembered across visits.
- **FR-002**: In Arabic, every interface string MUST be Arabic and the page MUST be right-to-left; diagrams keep their drawn direction.
- **FR-003**: Dates MUST use the active language's month names; digits MUST stay Western.
- **FR-004**: The Governance area's built-in content (default aspect names, section guides, policy templates, dashboard labels, lifecycle and status labels) MUST be translated.
- **FR-005**: AI-generated content MUST be written in the active language.
- **FR-006**: Server messages shown to the user (validation errors, refusals) MUST be in the active language.
- **FR-007**: The printed report, PPTX deck and spreadsheet exports MUST use the active language and direction.
- **FR-008**: User-entered content MUST NOT be altered or translated.

## Success Criteria *(mandatory)*

- **SC-001**: With Arabic active, no English interface text remains on any page (user content excepted).
- **SC-002**: Accessibility checks pass in both languages.
- **SC-003**: Switching language takes one click and applies everywhere immediately.

## Assumptions

- The Arabic is Modern Standard Arabic, written for business users; it should be reviewed by a native speaker before client use, especially the policy templates.
- Western digits are used throughout (common in Gulf business software, and consistent with process codes).
- Emails stay English in this version.
- Delivery is staged: (1) switcher, right-to-left layout, app shell and the Governance area with its content and AI language; (2) every other page; (3) exports and server messages.
