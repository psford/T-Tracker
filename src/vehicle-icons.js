// src/vehicle-icons.js — Vehicle icon SVG silhouettes for MBTA route types
// Pure data module: no logic, no imports, only SVG content strings

/**
 * VEHICLE_ICONS — SVG content for each MBTA route type
 *
 * Keys: MBTA route type numbers (0-4)
 * Values: SVG inner content (paths, rects, circles) — NOT complete <svg> tags
 *
 * All icons:
 * - Designed for 0 0 48 32 viewBox (48px wide, 32px tall)
 * - Default orientation faces right (east)
 * - Body uses `currentColor` for fill (set by map.js via CSS)
 * - Details use fixed colors: windows rgba(255,255,255,0.85), wheels #333, lines rgba(255,255,255,0.3)
 */
export const VEHICLE_ICONS = {
  // Type 0: Trolley/Streetcar (Green Line)
  // Rounded body with pantograph pole, 3-4 windows, 2 wheels
  0: `
    <!-- Pantograph pole extending upward from roof -->
    <line x1="24" y1="5" x2="24" y2="2" stroke="rgba(255,255,255,0.3)" stroke-width="0.8"/>
    <circle cx="24" cy="1.5" r="0.6" fill="rgba(255,255,255,0.3)"/>

    <!-- Rounded body -->
    <rect x="6" y="8" width="36" height="18" rx="3" ry="3" fill="currentColor"/>

    <!-- Windows (4 rectangular windows) -->
    <rect x="8" y="10" width="4" height="3" fill="rgba(255,255,255,0.85)"/>
    <rect x="16" y="10" width="4" height="3" fill="rgba(255,255,255,0.85)"/>
    <rect x="28" y="10" width="4" height="3" fill="rgba(255,255,255,0.85)"/>
    <rect x="36" y="10" width="4" height="3" fill="rgba(255,255,255,0.85)"/>

    <!-- Wheels (2 circles at bottom) -->
    <circle cx="12" cy="27" r="2" fill="#333"/>
    <circle cx="36" cy="27" r="2" fill="#333"/>
  `,

  // Type 1: Subway Car (Red/Orange/Blue)
  // Boxy angular body with continuous window band, 2 wheels
  1: `
    <!-- Boxy rectangular body with angular corners -->
    <rect x="4" y="8" width="40" height="18" fill="currentColor"/>

    <!-- Continuous window band (horizontal strip across upper body) -->
    <rect x="6" y="10" width="36" height="4" fill="rgba(255,255,255,0.85)"/>

    <!-- Subtle structural lines dividing windows -->
    <line x1="12" y1="10" x2="12" y2="14" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
    <line x1="18" y1="10" x2="18" y2="14" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
    <line x1="30" y1="10" x2="30" y2="14" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>
    <line x1="36" y1="10" x2="36" y2="14" stroke="rgba(255,255,255,0.3)" stroke-width="0.5"/>

    <!-- Wheels (2 circles at bottom) -->
    <circle cx="10" cy="27" r="2" fill="#333"/>
    <circle cx="38" cy="27" r="2" fill="#333"/>
  `,

  // Type 2: Commuter Rail Coach
  // Taller body with angled engine nose on right (front), horizontal accent stripe, 3-4 windows, 2 wheels
  2: `
    <!-- Angled engine nose on the right (front) -->
    <polygon points="40,8 44,16 40,24" fill="rgba(255,255,255,0.3)"/>

    <!-- Main body (taller than subway) -->
    <rect x="4" y="6" width="36" height="20" fill="currentColor"/>

    <!-- Horizontal accent stripe along lower body -->
    <rect x="4" y="18" width="36" height="2" fill="rgba(255,255,255,0.3)"/>

    <!-- Windows (3 above the stripe) -->
    <rect x="8" y="8" width="4" height="3" fill="rgba(255,255,255,0.85)"/>
    <rect x="16" y="8" width="4" height="3" fill="rgba(255,255,255,0.85)"/>
    <rect x="28" y="8" width="4" height="3" fill="rgba(255,255,255,0.85)"/>

    <!-- Wheels (2 circles at bottom) -->
    <circle cx="12" cy="28" r="2" fill="#333"/>
    <circle cx="36" cy="28" r="2" fill="#333"/>
  `,

  // Type 3: Bus
  // Rounded top profile (arch), large windshield at front (right), visible wheel wells, 2 wheels
  3: `
    <!-- Rounded top profile (arch shape) -->
    <path d="M 6 18 L 6 14 Q 6 8 24 8 Q 42 8 42 14 L 42 18" fill="currentColor" stroke="none"/>

    <!-- Main body lower rectangle -->
    <rect x="6" y="18" width="36" height="8" fill="currentColor"/>

    <!-- Large windshield at front (right side) -->
    <rect x="36" y="10" width="6" height="8" fill="rgba(255,255,255,0.85)"/>

    <!-- Side window -->
    <rect x="10" y="20" width="8" height="4" fill="rgba(255,255,255,0.85)"/>

    <!-- Visible wheel wells (larger wheel cutouts) -->
    <circle cx="14" cy="27" r="2.5" fill="rgba(255,255,255,0.3)"/>
    <circle cx="34" cy="27" r="2.5" fill="rgba(255,255,255,0.3)"/>

    <!-- Wheels inside the wells -->
    <circle cx="14" cy="27" r="1.5" fill="#333"/>
    <circle cx="34" cy="27" r="1.5" fill="#333"/>
  `,

  // Type 4: Ferry
  // Boat hull shape (curved bottom, no wheels), cabin/superstructure on top
  4: `
    <!-- Boat hull (curved bottom) -->
    <path d="M 8 14 L 8 22 Q 8 26 24 27 Q 40 26 40 22 L 40 14" fill="currentColor" stroke="none"/>

    <!-- Cabin/superstructure on top (box shape) -->
    <rect x="12" y="6" width="24" height="10" fill="currentColor"/>

    <!-- Cabin roof (simple triangle) -->
    <polygon points="12,6 24,2 36,6" fill="rgba(255,255,255,0.3)"/>

    <!-- Cabin windows (2 small rectangles) -->
    <rect x="15" y="8" width="3" height="2" fill="rgba(255,255,255,0.85)"/>
    <rect x="30" y="8" width="3" height="2" fill="rgba(255,255,255,0.85)"/>

    <!-- Waterline detail -->
    <line x1="8" y1="22" x2="40" y2="22" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
  `
};

/**
 * DEFAULT_ICON — Fallback icon for unknown route types
 * Set to bus (type 3) as default for unrecognized types
 */
export const DEFAULT_ICON = VEHICLE_ICONS[3];
