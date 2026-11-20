# uibrik

120 free, open-source React components from [uibrik](https://uibrik.com). Animated, accessible and built with Tailwind CSS v4 and Motion. Every one has a live demo and a Customize panel on the site.

## Install

Each component installs with the shadcn CLI, which also adds its dependencies and any CSS it needs:

```bash
npx shadcn@latest add https://uibrik.com/r/<component>.json
```

For example:

```bash
npx shadcn@latest add https://uibrik.com/r/accordion.json
```

Files land in `components/uibrik/`. You can also copy a file from [`components/`](./components) by hand. Components import `cn` from `@/lib/utils` ([included here](./lib/utils.ts)), and some need extra theme CSS that only the CLI adds, so the CLI is the easier path.

Requirements: React 19, Tailwind CSS v4.

### With an AI agent

uibrik has an MCP server, so your agent can search, preview and install components itself. See [https://uibrik.com/docs/mcp](https://uibrik.com/docs/mcp).

## Components

### Entrances

| Component | Description |
| --- | --- |
| [Blur Reveal](https://uibrik.com/components/blur-reveal) | Letters sharpen out of a blur, one after another. |
| [Fade In Left to Right](https://uibrik.com/components/fade-left-to-right) | A soft-edged mask reveals the text from left to right. |
| [Falling Letters](https://uibrik.com/components/falling-letters) | Letters drop in and settle with a small bounce. |
| [Highlighter](https://uibrik.com/components/highlighter) | A marker stroke sweeps across a key phrase. |
| [Line-by-line Rise](https://uibrik.com/components/line-rise) | Each wrapped line rises into place in turn. |
| [Outline then Fill](https://uibrik.com/components/outline-fill) | Letters are drawn as outlines, then filled in. |
| [Plucked Curve](https://uibrik.com/components/plucked-curve) | Text rides a curve that wobbles like a plucked string. |
| [Ripple to Still](https://uibrik.com/components/ripple-to-still) | Text ripples like water, then settles. |
| [Scramble Text](https://uibrik.com/components/scramble-text) | Letters resolve from random characters out of a soft blur, one after another. |
| [Scroll to Highlight](https://uibrik.com/components/scroll-highlight) | Words light up as you scroll past them. |
| [Tracking In](https://uibrik.com/components/tracking-in) | Lines open with a wide gap after every letter, and the gaps close one by one until the text settles. |
| [Typewriter](https://uibrik.com/components/typewriter) | Text typed with a human rhythm, mistakes included. |

### Transitions

| Component | Description |
| --- | --- |
| [Anagram Shuffle](https://uibrik.com/components/anagram-shuffle) | Letters rearrange themselves into the next anagram. |
| [Particle Scatter](https://uibrik.com/components/particle-scatter) | Each press breaks the phrase into particles that regroup. |
| [Redact and Reveal](https://uibrik.com/components/redact-reveal) | Black bars redact a line, then lift to reveal the next. |
| [Rolling Word](https://uibrik.com/components/rolling-word) | One word rolls to the next like a drum. |
| [Scatter Text](https://uibrik.com/components/scatter-text) | Phrases shatter into particles that regroup into the next phrase. |
| [Scramble to Word](https://uibrik.com/components/scramble-to-word) | A split-flap board scrambles to the next word. |
| [Slot-machine Letters](https://uibrik.com/components/slot-letters) | Each letter spins like a reel and lands on the next word. |
| [Status Stamp](https://uibrik.com/components/status-stamp) | An ink stamp slams down: approved, in review, rejected. |
| [Zoom Past](https://uibrik.com/components/zoom-past) | Words fly toward you and the next one arrives behind. |

### Interactive

| Component | Description |
| --- | --- |
| [Draggable Letters](https://uibrik.com/components/draggable-letters) | Letters you can pull apart; they spring home. |
| [Hover Weight](https://uibrik.com/components/hover-weight) | Letters grow heavier as the cursor nears them. |
| [Lean and Scramble](https://uibrik.com/components/lean-scramble) | Words lean and scramble under the cursor. |
| [Pull Toward Cursor](https://uibrik.com/components/pull-to-cursor) | Letters lean toward the cursor like a magnet. |
| [Rust Text](https://uibrik.com/components/rust-text) | Brushed steel type that rusts while you watch and flakes away, polished back to a shine wherever the pointer passes. |

### Buttons

| Component | Description |
| --- | --- |
| [Announcement Pill](https://uibrik.com/components/announcement-pill) | A small New pill for above a hero heading, with a band of light along its border and an arrow that grows on hover. |
| [Balloon Button](https://uibrik.com/components/balloon-button) | An inflated, half-balloon button drawn with a WebGL shader, with folds along its seam and a springy dent when pressed. |
| [Bookmark Button](https://uibrik.com/components/bookmark-button) | A save button whose bookmark fills from the top like a dropped ribbon while the label rolls to Saved. |
| [Chain Copy](https://uibrik.com/components/chain-copy) | A copy-link button whose chain icon snaps apart when pressed, flings two chips from the break, then swings back together and relinks as the label rolls to Copied. |
| [Copy Button](https://uibrik.com/components/copy-button) | A copy button whose two sheets slide together into a check while the label rolls to Copied. |
| [Expand Button](https://uibrik.com/components/expand-button) | An icon-only button that springs open to reveal its label on hover or keyboard focus. |
| [Hold to Confirm](https://uibrik.com/components/hold-to-confirm) | A destructive-action button that has to be held down; a fill grows across it and drains back if released early. |
| [Inline Confirm](https://uibrik.com/components/inline-confirm) | A destructive button that splits into Cancel and Confirm in its own footprint, so nothing around it moves. |
| [Share Menu](https://uibrik.com/components/share-menu) | A share button that flips open into a pill of options, resizing to fit. |
| [Soft Button](https://uibrik.com/components/soft-button) | A plain button made with care: a gentle top-to-bottom gradient, a faint inner highlight and shade, and a crisp border, in primary, secondary and accent. |
| [Split Button](https://uibrik.com/components/split-button) | A primary button with a menu of alternative actions; the chosen one rolls into the main label. |
| [Stepper Button](https://uibrik.com/components/stepper-button) | An add-to-cart button that reshapes into a quantity stepper in the same pill. |
| [Tactile Toggle](https://uibrik.com/components/tactile-toggle) | A single switch whose knob squishes under the finger, drags like the real thing and springs home on release. |
| [Theme Switch](https://uibrik.com/components/theme-switch) | Switches the page theme: the sun pulls in its rays and is eclipsed into a moon while the new theme spreads out from the button. |

### Inputs

| Component | Description |
| --- | --- |
| [Amount Pad](https://uibrik.com/components/amount-pad) | A money field where each digit drops in and lands, commas slide into place as the number grows, the amount shrinks to fit, and a digit past the limit bounces off in red. |
| [Checkbox](https://uibrik.com/components/checkbox) | A checkbox and checkbox group whose check draws itself on, morphs into a dash for a partly ticked select-all, and supports shift-click to tick a whole range at once. |
| [Elastic Slider](https://uibrik.com/components/elastic-slider) | A slider that stretches like rubber past its ends and springs back. |
| [Inline Edit](https://uibrik.com/components/inline-edit) | A label that opens into an input in place, with save and cancel sliding out from its edge, then folds back to the new value. |
| [Radio Group](https://uibrik.com/components/radio-group) | A radio group where one dot travels to the option you choose instead of blinking, as plain rows or bordered cards with an outline that follows, with full arrow-key control. |
| [Reject Drop Input](https://uibrik.com/components/reject-drop-input) | A text input that lets go of characters it can't accept: a rejected letter appears where it was typed, blushes red, tips over its corner and drops out of the field under real gravity, fading as it falls, while a short hint says what the field takes. |
| [Segmented Control](https://uibrik.com/components/segmented-control) | A segmented control whose pill slides between options on a spring, squishes when pressed and can be dragged across the segments like the one on iOS. |
| [Spill Textarea](https://uibrik.com/components/spill-textarea) | A textarea with a character limit. A ring fills as you write and turns amber near the end; past the limit each new letter blushes red, tips over and falls out of the field, leaving an empty gap where it was, or stays red while a copy of it falls. |
| [Swap Fields](https://uibrik.com/components/swap-fields) | A from/to pair whose fields trade places along opposite arcs when you press swap, carrying their values with them while the slot labels hand over. |
| [Tactile Toggles](https://uibrik.com/components/tactile-toggles) | A settings list whose switches squish under the finger, drag like the real thing, sweep a faint tint across the row as they turn on, and pause the rows they override. |
| [Tag Input](https://uibrik.com/components/tag-input) | A field that turns typed or pasted text into chips that pop in and shrink out, with Backspace to select and remove, arrow keys to move between chips and a nudge for duplicates. |
| [Waitlist Input](https://uibrik.com/components/waitlist-input) | An email field with its button inside that shrinks to a spinner, then settles into a confirmation in the same space. |

### Navigation

| Component | Description |
| --- | --- |
| [Collapsing Breadcrumb](https://uibrik.com/components/collapsing-breadcrumb) | A breadcrumb that folds its middle crumbs into an ellipsis when space runs out and unfolds them in place on hover or tap, each crumb sliding open to its own width. |
| [Fold Toolbar](https://uibrik.com/components/fold-toolbar) | An icon button that unfolds into a tray of tools, pushing its neighbours aside, and folds back into whichever tool you pick. |
| [Hamburger Sheet](https://uibrik.com/components/hamburger-sheet) | A menu button that grows into its own sheet: the shape unfolds from the button's corner while the three lines cross into the close mark. |
| [Large Title Header](https://uibrik.com/components/large-title-header) | A large page title that rides up with the content and docks into the top bar as you scroll, moving and scaling as one piece, with the bar filling in behind it. |
| [On This Page](https://uibrik.com/components/on-this-page) | A section outline where a dot rides a rail with your scroll, subsections fold open as you reach them, and clicking jumps to a section. |
| [Page Indicator](https://uibrik.com/components/page-indicator) | Pagination dashes you can click, scrub, step with arrows or type into. |
| [Pagination](https://uibrik.com/components/pagination) | Pagination that never changes width: the current-page pill slides between slots, page numbers roll like an odometer when the window shifts, and an ellipsis opens into a jump-to-page field. |
| [Progress Dots](https://uibrik.com/components/progress-dots) | Pagination dots where the active one stretches into a pill that fills as it plays, and the row opens into labelled steps on hover. Also comes as full-width story segments. |
| [Section Pill](https://uibrik.com/components/section-pill) | A floating pill that names the section you're reading, with a ring for how far down the page you are, and opens into the full list, carrying the current title to its row. |
| [Tick Nav](https://uibrik.com/components/tick-nav) | A section list on a ruler whose ticks swell like a dock under the pointer, sliding each label out with its tick. |

### Overlays

| Component | Description |
| --- | --- |
| [Command Menu](https://uibrik.com/components/command-menu) | A calm ⌘K command menu: fuzzy and server search, grouped results, nested pages, recents, hotkeys and full keyboard control, with optional filter pills. |
| [Context Menu](https://uibrik.com/components/context-menu) | A menu that opens where you right-click or long-press, with submenus, checkable items and full keyboard control. |
| [Cookie Consent](https://uibrik.com/components/cookie-consent) | A cookie consent banner that slides up after load, grows in place into per-category switches, remembers the visitor's choice in localStorage and reopens straight to their saved settings. |
| [Dialog](https://uibrik.com/components/dialog) | A modal that grows out of the button that opened it, holds focus, and eases back when another dialog opens on top. |
| [Dropdown Menu](https://uibrik.com/components/dropdown-menu) | A menu with icons, shortcuts, checkbox and radio items and submenus, a sliding highlight and full keyboard control. |
| [Hover Card](https://uibrik.com/components/hover-card) | A preview card that opens while you rest on a link and stays while you move into it, so its own links work. |
| [Morphing Popover](https://uibrik.com/components/morphing-popover) | A button that grows into a panel by springing its real size and corners, so nothing stretches, then folds back into the button. |
| [Notification Stack](https://uibrik.com/components/notification-stack) | Notifications that pile up as panes of frosted glass, fan out on hover and blur away when swiped. |
| [Popover](https://uibrik.com/components/popover) | A panel that grows out of its button, flips when there's no room, and keeps its arrow pointed at the button. |
| [Toast](https://uibrik.com/components/toast) | Toasts that stack, fan out on hover, swipe away, and follow a promise from loading to done in one toast. |
| [Tooltip](https://uibrik.com/components/tooltip) | A quiet tooltip that waits before the first one shows, then swaps instantly between neighbours in a toolbar. |

### Loaders & Progress

| Component | Description |
| --- | --- |
| [Liquid Progress](https://uibrik.com/components/liquid-progress) | A simple progress bar with a liquid feel: tones of one colour that brighten as it fills, a soft shine, and a front that settles with a small wobble. |
| [Loading Shimmer](https://uibrik.com/components/loading-shimmer) | A light sweep across text while something loads. |
| [Progress](https://uibrik.com/components/progress) | A quiet card of work in flight: each row is the app's mark, what's happening and a thin bar, and opens like a dropdown into facts, steps or one bar per destination. Values ease on a spring, percentages count with the fill, and finishing draws a check. |
| [Send](https://uibrik.com/components/send) | File upload that fills, then launches a paper plane out of the card. |
| [Skeleton](https://uibrik.com/components/skeleton) | A skeleton measured from the real layout: one bar per wrapped line of text, a box for every image and control, one shimmer across them all, and a top-to-bottom reveal when the content arrives. |
| [Spinner](https://uibrik.com/components/spinner) | A small family of loading indicators (ring, radial, dots, bars, orbit) drawn on one grid with one stroke and tempo. |

### AI

| Component | Description |
| --- | --- |
| [Prompt Input](https://uibrik.com/components/prompt-input) | An AI prompt box that grows as you type, with file attachments, a model picker, slash commands, @mentions, a send button that turns into stop, and voice dictation whose words settle in as they are heard. |

### Data Display

| Component | Description |
| --- | --- |
| [Code Block](https://uibrik.com/components/code-block) | A code block that shows plain text at once and colours it in place with on-demand Shiki, with tabs that sync across blocks, marked lines, diffs, collapsing and a copy button. |
| [Strike Todos](https://uibrik.com/components/strike-todos) | A plain to-do list: checking an item draws a line through it, and unchecking wipes the line away. |
| [Tree View](https://uibrik.com/components/tree-view) | A file and folder tree with folders that ease open, guide lines, a sliding selection and full tree keyboard control. |

### Avatars & Badges

| Component | Description |
| --- | --- |
| [Avatar Stack](https://uibrik.com/components/avatar-stack) | Overlapping avatars that fan on hover and spring apart into a named list on a card growing out of the row. |
| [Light Badge](https://uibrik.com/components/light-badge) | A badge lit from below by a rotating gradient stroke and soft rays. |

### Layout

| Component | Description |
| --- | --- |
| [Filter Grid](https://uibrik.com/components/filter-grid) | Tabs over a grid of tiles that can sit in several tabs: tiles in both glide to their new places, leaving ones blur away, newcomers grow in one by one, and the grid's height eases to fit. |
| [Fold Tabs](https://uibrik.com/components/fold-tabs) | Tabs that fold into an accordion when their container gets narrow, with the track, the active pill and every label carried across so the switch reads as one object changing shape. |
| [Jiggle Grid](https://uibrik.com/components/jiggle-grid) | A home-screen grid you rearrange like on a phone: hold a tile and they all wobble, drag one and the rest spring aside to make room. |
| [Split Panes](https://uibrik.com/components/split-panes) | Resizable panes that follow the pointer exactly, snap into an icon rail when dragged past their minimum, and fold on their own when the container gets small. |

### Media

| Component | Description |
| --- | --- |
| [Compare Slider](https://uibrik.com/components/compare-slider) | A before-and-after frame that sweeps in on first view, with a smooth draggable divider, keyboard support and labels that step aside. |
| [Folder Peek](https://uibrik.com/components/folder-peek) | A folder whose file previews rise and fan out on hover, fly out into a list when opened, and that takes files dropped onto it. |

### Stats

| Component | Description |
| --- | --- |
| [Gauge Dial](https://uibrik.com/components/gauge-dial) | A 240-degree dial whose gradient arc fills behind a spring-driven knob, with lit ticks and a zone badge; drag it or use the arrow keys. |
| [KPI Tile](https://uibrik.com/components/kpi-tile) | A dashboard stat with its change and a sparkline you can scrub, rolling the number to any day. |

### Effects

| Component | Description |
| --- | --- |
| [Marquee](https://uibrik.com/components/marquee) | An endless, seamless row of logos, quotes or tags that slows on hover and fades out at the edges. |

### Navbars

| Component | Description |
| --- | --- |
| [Classic Navbar](https://uibrik.com/components/classic-navbar) | A full-width bar that hides while you scroll down and returns on scroll up, with an underline that slides to the current page. Links left, centred or right; zero to two CTAs. |

### FAQ

| Component | Description |
| --- | --- |
| [Accordion](https://uibrik.com/components/accordion) | Sections that ease open to their height while the content fades up behind, one at a time or several, with full keyboard support. |
| [Folder FAQ](https://uibrik.com/components/folder-faq) | An FAQ laid out as files in a drawer: each question peeks out on its tab, and opening one lifts it from the stack while the folders in front slide down to uncover the answer. |
| [Split Accordion](https://uibrik.com/components/split-accordion) | Sections that sit together as one block. Opening one splits it away from its neighbours with an easing margin, rounds the corners at the break and reveals the answer; closing it merges the block back. |

### Testimonials

| Component | Description |
| --- | --- |
| [Testimonial Carousel](https://uibrik.com/components/testimonial-carousel) | One large quote at a time over a faint oversized quote mark, with a pill pager below; the frame eases to each quote's height, and it swipes and steps with the arrow keys. |

### Cards

| Component | Description |
| --- | --- |
| [Event Feed](https://uibrik.com/components/event-feed) | A live feed card where new events drop in at the top with a soft highlight, push the rest down and age in real time. |
| [File Card](https://uibrik.com/components/file-card) | A document card whose corner curls on hover to show the next page, with older versions stacked behind the sheet. |

### Community

| Component | Description |
| --- | --- |
| [Open Source](https://uibrik.com/components/open-source) | A repository card whose stars, forks and contributor count roll up digit by digit on view, with a sparkline that draws in, a language bar, contributor faces that slide in and fan open, and a live feed of commits, merges and releases. |

### Charts

| Component | Description |
| --- | --- |
| [Area Chart](https://uibrik.com/components/area-chart) | A time-series chart with soft area washes and one crosshair that reads every series at once. |
| [Bar List](https://uibrik.com/components/bar-list) | A ranked list of top pages, referrers or countries whose rows slide to their new rank and resize when you switch lists. |
| [Split Bar](https://uibrik.com/components/split-bar) | Parts of a whole on one bar, linked to a list, with segments that slide to new shares when the data changes. |

### App Screens

| Component | Description |
| --- | --- |
| [Email Composer](https://uibrik.com/components/email-composer) | An email composer with recipient chips and suggestions, contact cards on hover, drag-and-drop attachments with upload progress, and a send button that schedules. |
| [Org Chart](https://uibrik.com/components/org-chart) | A pan-and-zoom org chart whose teams grow out of and fold back into their manager, with search that flies to a person, a minimap and profile cards. |

### Backgrounds

| Component | Description |
| --- | --- |
| [Aurora](https://uibrik.com/components/aurora) | Slow curtains of light with fine rays that lean toward the cursor. |
| [Caustics](https://uibrik.com/components/caustics) | Sunlight on a pool floor, from light rays bent by moving water; click to drop a ripple. |
| [Diagonal Beams](https://uibrik.com/components/diagonal-beams) | One soft light falling across sharp, slanted pleats in the dark, its edge dissolving into fine grain. |
| [Dither Gradient](https://uibrik.com/components/dither-gradient) | A bending gradient drawn only in your colours through an ordered dither. |
| [Dot Grid](https://uibrik.com/components/dot-grid) | A quiet grid of dots lit by a drifting wave and by the cursor. |
| [Grain Gradient](https://uibrik.com/components/grain-gradient) | Colour that folds slowly like silk, finished with film grain. |
| [Halftone](https://uibrik.com/components/halftone) | A screen of lit dots: swirling ribbons of light drawn by the size and brightness of each dot. |
| [Horizon Gradient](https://uibrik.com/components/horizon-gradient) | Black fading through deep blue to white in bands that arch like a horizon, breathing slowly. |
| [Light Rain](https://uibrik.com/components/light-rain) | Thin lines of blue light falling through the dark, with bright glints sliding along them. |
| [Light Stream](https://uibrik.com/components/light-stream) | An hourglass of fine iridescent light streaks with glittering dust, flowing through the dark. |
| [Silk Cloth](https://uibrik.com/components/silk-cloth) | A sheet of satin rippling in a light breeze, with a long sheen along every fold. |
| [Silk Vortex](https://uibrik.com/components/silk-vortex) | Liquid glass streaming outward from a dark void: glossy folds mapped through a colour gradient. |
| [Topographic Lines](https://uibrik.com/components/topographic-lines) | Contour lines of a slowly shifting landscape, like a survey map; the pointer raises a hill the lines ring around. |

## Pro

This repository holds the free components only. More components, blocks and backgrounds are part of [uibrik Pro](https://uibrik.com/#pricing).

## Contributing

This repository is generated from the uibrik source, so pull requests can't be merged directly. Bug reports and ideas are welcome as [issues](../../issues).

## License

[MIT](./LICENSE) for the components in this repository.
