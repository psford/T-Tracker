// src/ui.js — Route selection control panel UI
import { config } from '../config.js';
import { groupAndSortRoutes } from './route-sorter.js';

const STORAGE_KEY = 'ttracker-highlighted-routes';

// Cache the media query result to avoid recreating the MediaQueryList on every call
const mobileMediaQuery = window.matchMedia('(max-width: 767px)');

/**
 * Reads highlighted routes from localStorage.
 * Returns null if not set, otherwise returns a Set of route IDs.
 * Validates that parsed JSON is an array.
 *
 * @returns {Set<string> | null}
 */
function readFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
        return null;
    }
    try {
        const array = JSON.parse(stored);
        if (!Array.isArray(array)) {
            console.warn('Stored highlighted routes is not an array, ignoring');
            return null;
        }
        return new Set(array);
    } catch (error) {
        console.warn('Failed to parse stored highlighted routes:', error);
        return null;
    }
}

/**
 * Writes highlighted routes to localStorage as a JSON array.
 *
 * @param {Set<string>} highlightedSet — set of route IDs to save
 */
function writeToStorage(highlightedSet) {
    const array = Array.from(highlightedSet);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(array));
}

/**
 * Detects if the device is mobile (viewport width < 768px).
 * Uses cached CSS media query matching for consistent breakpoint.
 *
 * @returns {boolean} true if mobile, false if desktop
 */
function isMobileViewport() {
    return mobileMediaQuery.matches;
}

/**
 * Initializes the route selection UI in the #controls container.
 * Builds a control panel with checkboxes for each route.
 * Restores selection from localStorage (or uses config defaults if no saved state).
 * Calls onHighlightChange with the initial highlighted set and on every checkbox change.
 *
 * On mobile: creates a drawer that slides in from the right with a toggle button and backdrop.
 * On desktop: renders the panel in static position with no toggle or backdrop.
 *
 * @param {Array<Object>} routeMetadata — array of {id, color, shortName, longName, type}
 * @param {Function} onHighlightChange — callback(highlightedSet: Set<routeId>)
 */
export function initUI(routeMetadata, onHighlightChange) {
    const controlsContainer = document.getElementById('controls');
    if (!controlsContainer) {
        console.error('Element #controls not found in DOM');
        return;
    }

    // Determine initial highlighted routes
    let initialHighlighted = readFromStorage();
    if (initialHighlighted === null) {
        // No localStorage — use config defaults
        initialHighlighted = new Set(config.routes.defaultHighlighted);
    } else {
        // Validate that stored route IDs still exist in metadata
        const validRouteIds = new Set(routeMetadata.map((r) => r.id));
        const filtered = new Set(
            Array.from(initialHighlighted).filter((id) => validRouteIds.has(id))
        );
        initialHighlighted = filtered;
    }

    // Save initial state to storage
    writeToStorage(initialHighlighted);

    // Build control panel HTML
    const grouped = groupAndSortRoutes(routeMetadata);

    const panel = document.createElement('div');
    panel.className = 'control-panel';

    const title = document.createElement('h3');
    title.className = 'control-panel__title';
    title.textContent = 'Routes';
    panel.appendChild(title);

    const routeList = document.createElement('div');
    routeList.className = 'route-list';

    grouped.forEach(({ group, routes }) => {
        // Add group heading
        const groupHeading = document.createElement('div');
        groupHeading.className = 'route-group-heading';
        groupHeading.textContent = group;
        routeList.appendChild(groupHeading);

        routes.forEach((route) => {
            const label = document.createElement('label');
            label.className = 'route-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = route.id;
            checkbox.checked = initialHighlighted.has(route.id);
            checkbox.dataset.routeId = route.id;

            const swatch = document.createElement('span');
            swatch.className = 'route-swatch';
            swatch.style.background = route.color;

            const name = document.createElement('span');
            name.className = 'route-name';
            name.textContent = route.shortName;

            label.appendChild(checkbox);
            label.appendChild(swatch);
            label.appendChild(name);

            // On checkbox change, update storage and call callback
            checkbox.addEventListener('change', () => {
                const currentHighlighted = new Set();
                routeList.querySelectorAll('input[type="checkbox"]:checked').forEach(
                    (cb) => {
                        currentHighlighted.add(cb.dataset.routeId);
                    }
                );

                writeToStorage(currentHighlighted);
                onHighlightChange(currentHighlighted);

                // Close drawer on mobile after checkbox change
                if (isMobileViewport()) {
                    closeDrawer();
                }
            });

            routeList.appendChild(label);
        });
    });

    panel.appendChild(routeList);
    controlsContainer.appendChild(panel);

    // Create drawer backdrop (mobile only)
    const backdrop = document.createElement('div');
    backdrop.className = 'drawer-backdrop';
    controlsContainer.appendChild(backdrop);

    // Create drawer toggle button (mobile only)
    const toggleButton = document.createElement('button');
    toggleButton.className = 'drawer-toggle';
    toggleButton.setAttribute('aria-label', 'Toggle route filter drawer');
    toggleButton.innerHTML = '☰'; // Menu/filter icon
    controlsContainer.appendChild(toggleButton);

    // Drawer state management
    function openDrawer() {
        panel.classList.add('control-panel--open');
        backdrop.classList.add('drawer-backdrop--visible');
    }

    function closeDrawer() {
        panel.classList.remove('control-panel--open');
        backdrop.classList.remove('drawer-backdrop--visible');
    }

    function toggleDrawer() {
        if (panel.classList.contains('control-panel--open')) {
            closeDrawer();
        } else {
            openDrawer();
        }
    }

    // Toggle button click handler
    toggleButton.addEventListener('click', toggleDrawer);

    // Backdrop click handler — close drawer
    backdrop.addEventListener('click', closeDrawer);

    // Escape key handler — close drawer when Escape is pressed and drawer is open
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel.classList.contains('control-panel--open')) {
            closeDrawer();
        }
    });

    // Call onHighlightChange with initial state
    onHighlightChange(initialHighlighted);
}
