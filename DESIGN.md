# ACE Teacher Application - Design Specification (Stitch Sync)

## 1. Core Chassis
- **Layout Approach:** Mobile-first, strict bounded viewport
- **Dimensions:** 375px wide, 780px high, max-height 92vh
- **Shape:** 40px rounded corners
- **Border:** 8px solid Slate-900
- **Background:** Deep Navy (#0E1424)
- **Shadow:** 2xl spread for elevation

## 2. Color Palette & Typography
- **Primary Accent:** Electric Emerald (#34d399) / Teal
- **Background Accents:** Emerald/950 with 40% opacity (rgba(2, 44, 34, 0.4))
- **Text Primary:** White / Off-white for high contrast
- **Text Secondary:** Slate-400
- **Typography:** Inter (Google Fonts)

## 3. UI Components
- **Top Navigation:** Contains logo, teacher profile, and logout mechanism.
- **Filter Bar:**
  - Two dropdowns: "Class" and "Section".
  - Clean, minimal aesthetic.
- **Student List:**
  - Scrollable view within the chassis bounds.
  - Student items: Name, Avatar/Initials.
- **Toggle Switches (Attendance):**
  - States: 🟢 PRESENT (Emerald) and 🔴 ABSENT (Red/Rose).
- **Grade Input Fields (Academics):**
  - Number inputs for Midterm/Final grades in Math, Science, and English.
  - Synchronized auto-save indicators.

## 4. Stitch Synchronization State
- **Status:** Synced
- **Last Push:** 2026-05-28
- **Generated Framework:** React + Vanilla CSS (to comply with structural design rules)
