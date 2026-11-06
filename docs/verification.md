# Release verification — 2026-11-06

Version: 0.1.0. Checks performed locally before the first public source push.

- All 19 Node tests passed, including 300 deterministic generated graphs compared with an independent cycle/chain oracle, the 5,000-rule boundary, malformed CSV, unsafe locations, report escaping, and CLI exit codes.
- Static deployment build succeeded. No runtime or build dependencies are required.
- Built-in browser testing covered pasting and analyzing CSV, local file import, error filters, stale-report export prevention, invalid-input report export, and actual JSON/Markdown/CSV downloads. Browser console showed no errors or warnings.
- Desktop viewport: 1487 × 1058, matching the concept's native dimensions. Mobile: 390 × 844 and 320 × 740. A narrow-header overflow found at 320px was repaired with a wrapping header.

## Design comparison

The built-in image generation tool produced `design-concept.png` from a full-screen utility brief: white surface, navy system typography, forest-green controls, CSV input alongside diagnostic results, and Webizmo attribution. Both that image and the final `screenshot.png` were inspected with the image viewer.

| Comparison | Result |
| --- | --- |
| Layout | Header, two-line introduction, 43:57 workspace, and footer preserve the concept hierarchy. |
| Typography | System sans and monospace paths preserve the heading/body/control hierarchy without external font requests. |
| Palette | White surface, navy text, green actions, red errors, amber warnings, and gray borders preserve the concept. |
| Containers and spacing | Two fine-bordered panels with 10px corners, open issue rows, and no decorative shadows. |
| Controls and icon treatment | Native buttons/select, filled error circle and warning triangle, visible focus styles. |
| Responsive behavior | Panels stack below 850px; issue details and controls wrap; header wraps on the narrowest screens. |

Above-the-fold copy matches the brief. Intentional functional differences: one diagnostic per distinct cycle gives **1 error**, not the mockup's duplicate **2 errors**; a format select exposes all three export types; issue line numbers and explanatory messages make findings actionable. The actual app contains two initial findings instead of duplicating a cycle. These are data-correctness and usability choices, not unfinished UI. No material visual mismatch remained after review.

Scope: these are static exact-path checks. No live redirect destinations, SEO outcomes, assistive-device certification, or server configurations were validated.
