// src/ui.js — Route selection control panel UI
import { config } from '../config.js';

const STORAGE_KEY = 'ttracker-highlighted-routes';

/**
 * Organizes route metadata into groups with sorting:
 * 1. Green Line branches (B, C, D, E) sorted alphabetically
 * 2. Bus routes sorted numerically
 *
 * @param {Array<Object>} metadata — array of {id, color, shortName, type}
 * @returns {Array<{group: string, routes: Array<Object>}>}
 */
function groupAndSortRoutes(metadata) {
    const greenLineRoutes = [];
    const busRoutes = [];

    metadata.forEach((route) => {
        if (route.id.startsWith('Green-')) {
            greenLineRoutes.push(route);
        } else {
            busRoutes.push(route);
        }
    });

    // Sort Green Line branches by their suffix (B, C, D, E)
    greenLineRoutes.sort((a, b) => {
        const suffixA = a.id.replace('Green-', '');
        const suffixB = b.id.replace('Green-', '');
        return suffixA.localeCompare(suffixB);
    });

    // Sort bus routes numerically
    busRoutes.sort((a, b) => {
        const numA = parseInt(a.shortName, 10) || a.shortName;
        const numB = parseInt(b.shortName, 10) || b.shortName;
        if (typeof numA === 'number' && typeof numB === 'number') {
            return numA - numB;
        }
        return String(numA).localeCompare(String(numB));
    });

    const groups = [];
    if (greenLineRoutes.length > 0) {
        groups.push({ group: 'Green Line', routes: greenLineRoutes });
    }
    if (busRoutes.length > 0) {
        groups.push({ group: 'Bus Routes', routes: busRoutes });
    }

    return groups;
}

/**
 * Reads highlighted routes from localStorage.
 * Returns null if not set, otherwise returns a Set of route IDs.
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
 * Initializes the route selection UI in the #controls container.
 * Builds a control panel with checkboxes for each route.
 * Restores selection from localStorage (or uses config defaults if no saved state).
 * Calls onHighlightChange with the initial highlighted set and on every checkbox change.
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
            });

            routeList.appendChild(label);
        });
    });

    panel.appendChild(routeList);
    controlsContainer.appendChild(panel);

    // Call onHighlightChange with initial state
    onHighlightChange(initialHighlighted);
}
