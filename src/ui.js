// src/ui.js — Route selection control panel UI
import { config } from '../config.js';
import { groupAndSortRoutes } from './route-sorter.js';

const STORAGE_KEY = 'ttracker-visible-routes';
const SERVICE_TOGGLES_KEY = 'ttracker-service-toggles';

// Cache the media query result to avoid recreating the MediaQueryList on every call
const mobileMediaQuery = window.matchMedia('(max-width: 767px)');

/**
 * Reads visible routes from localStorage.
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
            console.warn('Stored visible routes is not an array, ignoring');
            return null;
        }
        return new Set(array);
    } catch (error) {
        console.warn('Failed to parse stored visible routes:', error);
        return null;
    }
}

/**
 * Writes visible routes to localStorage as a JSON array.
 *
 * @param {Set<string>} visibleSet — set of route IDs to save
 */
function writeToStorage(visibleSet) {
    const array = Array.from(visibleSet);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(array));
}

/**
 * Reads service toggles from localStorage.
 * Returns null if not set, otherwise returns an object with service toggle states.
 * Validates that parsed JSON is an object.
 *
 * @returns {Object | null}
 */
function readServiceToggles() {
    const stored = localStorage.getItem(SERVICE_TOGGLES_KEY);
    if (!stored) {
        return null;
    }
    try {
        const obj = JSON.parse(stored);
        if (typeof obj !== 'object' || obj === null) {
            return null;
        }
        return obj;
    } catch {
        return null;
    }
}

/**
 * Writes service toggles to localStorage as a JSON object.
 *
 * @param {Object} toggles — object with service toggle states
 */
function writeServiceToggles(toggles) {
    localStorage.setItem(SERVICE_TOGGLES_KEY, JSON.stringify(toggles));
}

/**
 * Maps group names to service toggle keys.
 */
const groupToToggleKey = {
    'Subway': 'subway',
    'Bus': 'bus',
    'Commuter Rail': 'commuterRail',
};

/**
 * Maps a route to its service type toggle key.
 * Routes with type 0 (light rail) or 1 (heavy rail) are subway.
 * Routes with type 2 are commuter rail.
 * All other types default to bus.
 *
 * @param {Object} route — route object with type property
 * @returns {string} service type key ('subway', 'commuterRail', or 'bus')
 */
function getServiceTypeForRoute(route) {
    if (route.type === 0 || route.type === 1) return 'subway';
    if (route.type === 2) return 'commuterRail';
    return 'bus';
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
 * Builds a control panel with three-tier collapsible checkboxes (service groups, routes, subgroups).
 * Restores selection from localStorage (or uses config defaults if no saved state).
 * Calls onVisibilityChange with the initial visible set and on every checkbox change.
 *
 * On mobile: creates a drawer that slides in from the right with a toggle button and backdrop.
 * On desktop: renders the panel in static position with no toggle or backdrop.
 *
 * @param {Array<Object>} routeMetadata — array of {id, color, shortName, longName, type}
 * @param {Function} onVisibilityChange — callback(visibleSet: Set<routeId>)
 */
export function initUI(routeMetadata, onVisibilityChange) {
    const controlsContainer = document.getElementById('controls');
    if (!controlsContainer) {
        console.error('Element #controls not found in DOM');
        return;
    }

    // Read service toggles (first visit defaults to Subway on, Bus and Commuter Rail off)
    let serviceToggles = readServiceToggles();
    if (serviceToggles === null) {
        serviceToggles = { subway: true, bus: false, commuterRail: false };
    }

    // Determine initial visible routes
    let storedVisible = readFromStorage();
    const validRouteIds = new Set(routeMetadata.map((r) => r.id));

    let initialVisible;
    if (storedVisible === null) {
        // First visit: visible = all routes in enabled service types
        initialVisible = new Set();
        routeMetadata.forEach((route) => {
            const serviceType = getServiceTypeForRoute(route);
            if (serviceToggles[serviceType]) {
                initialVisible.add(route.id);
            }
        });
    } else {
        // Returning visit: filter out removed routes, add new routes for enabled services
        initialVisible = new Set(
            Array.from(storedVisible).filter((id) => validRouteIds.has(id))
        );
        // New routes: in metadata but not in stored state
        routeMetadata.forEach((route) => {
            if (!storedVisible.has(route.id)) {
                const serviceType = getServiceTypeForRoute(route);
                if (serviceToggles[serviceType]) {
                    initialVisible.add(route.id);
                }
            }
        });
    }

    // Save initial state to storage
    writeToStorage(initialVisible);
    writeServiceToggles(serviceToggles);

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

    // Helper function to collect visible routes based on master toggle state and individual checkboxes
    function collectVisibleRoutes() {
        const visible = new Set();
        routeList.querySelectorAll('.service-group').forEach((group) => {
            const masterCheckbox = group.querySelector('.service-group__toggle');
            if (!masterCheckbox.checked) return; // Skip entire group if master unchecked
            group.querySelectorAll('.service-group__children input[type="checkbox"]:checked').forEach((cb) => {
                visible.add(cb.dataset.routeId);
            });
        });
        return visible;
    }

    grouped.forEach(({ group, routes, subGroups }) => {
        // Create service group container
        const serviceGroup = document.createElement('div');
        serviceGroup.className = 'service-group';

        // Create master toggle header
        const header = document.createElement('label');
        header.className = 'service-group__header';

        const masterCheckbox = document.createElement('input');
        masterCheckbox.type = 'checkbox';
        masterCheckbox.className = 'service-group__toggle';
        masterCheckbox.dataset.group = group;
        // Set checked state based on service toggle
        const toggleKey = groupToToggleKey[group];
        masterCheckbox.checked = toggleKey ? serviceToggles[toggleKey] : true;

        const groupName = document.createElement('span');
        groupName.className = 'service-group__name';
        groupName.textContent = group;

        header.appendChild(masterCheckbox);
        header.appendChild(groupName);
        serviceGroup.appendChild(header);

        // Create children container
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'service-group__children';
        // If master is unchecked, start collapsed
        if (!masterCheckbox.checked) {
            childrenContainer.classList.add('service-group__children--collapsed');
        }

        // Helper to add a route item
        function addRouteItem(route) {
            const label = document.createElement('label');
            label.className = 'route-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = route.id;
            checkbox.checked = initialVisible.has(route.id);
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

            // On individual checkbox change, update storage and call callback
            checkbox.addEventListener('change', () => {
                const currentVisible = collectVisibleRoutes();
                writeToStorage(currentVisible);
                onVisibilityChange(currentVisible);

                // Close drawer on mobile after checkbox change
                if (isMobileViewport()) {
                    closeDrawer();
                }
            });

            childrenContainer.appendChild(label);
        }

        // Render subgroups first (if they exist), then main routes
        if (subGroups && subGroups.length > 0) {
            subGroups.forEach(({ group: subgroupName, routes: subgroupRoutes }) => {
                // Add subgroup heading
                const subgroupHeading = document.createElement('div');
                subgroupHeading.className = 'route-subgroup-heading';
                subgroupHeading.textContent = subgroupName;
                childrenContainer.appendChild(subgroupHeading);

                // Add routes in this subgroup
                subgroupRoutes.forEach(addRouteItem);
            });
        }

        // Add main group routes (not in a subgroup)
        routes.forEach(addRouteItem);

        // Master toggle behavior: collapse/expand children
        masterCheckbox.addEventListener('change', () => {
            if (masterCheckbox.checked) {
                childrenContainer.classList.remove('service-group__children--collapsed');
            } else {
                childrenContainer.classList.add('service-group__children--collapsed');
            }

            // Update service toggle state
            const toggleKey = groupToToggleKey[group];
            if (toggleKey) {
                serviceToggles[toggleKey] = masterCheckbox.checked;
                writeServiceToggles(serviceToggles);
            }

            // Update visibility based on current state
            const currentVisible = collectVisibleRoutes();
            writeToStorage(currentVisible);
            onVisibilityChange(currentVisible);

            // Close drawer on mobile after checkbox change
            if (isMobileViewport()) {
                closeDrawer();
            }
        });

        serviceGroup.appendChild(childrenContainer);
        routeList.appendChild(serviceGroup);
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

    // Call onVisibilityChange with initial state
    onVisibilityChange(initialVisible);
}
