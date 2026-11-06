# Redirect Guard interface

The generated primary-screen concept is `design-concept.png`. The interface uses a white background, near-black navy text (#080d16), muted slate copy (#566173), forest green controls (#197336), thin cool gray borders (#c9ced7), red errors (#c82b2d), and ochre warnings (#a76500). System sans-serif typography keeps the app independent of font networks; CSV and path content use the system monospace stack.

The desktop screen has a simple brand/navigation header, a two-line 60px headline, supporting copy, and two adjacent tool panels in a 43:57 split. Panels use 10px corners, 20px padding, open bordered issue rows, and no shadows or decorative media. Controls share 7px corners and a minimum 42px height. The editor and report collapse into one column below 850px; issue details move beneath issue headings on narrow screens. Focus rings and text labels are present throughout.

Visible copy follows the concept: “Catch redirect mistakes. Before they ship.”, “Find loops, conflicting rules, and unnecessary hops in your redirect map.”, “Your file stays in your browser.”, Redirect map, Analysis, Load example, Import CSV, Analyze redirects, All issues, Errors, Warnings, Download report, and the original scope/footer copy.

Required functional extensions to the concept are a report-format select beside the download button, issue severity/line labels and explanatory details, edited-input status, an export limit note, and useful empty/error states. Counts always reflect the real analysis. Code-native SVG error/warning symbols match the concept's filled circle/triangle treatment. No central raster assets are necessary for this tool.

The initial CSV is the concept's five-rule example, analyzed immediately. Editing invalidates export until analysis runs again; importing and loading an example run analysis. Only the first 100 issues matching a filter are rendered, while report downloads retain all diagnostics. The UI renders user input with text nodes, never HTML.
