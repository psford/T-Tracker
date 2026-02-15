// src/route-sorter.js — Pure function for organizing and sorting route metadata
// Extracted from ui.js for testability (no browser dependencies)

/**
 * Organizes route metadata into four top-level groups with nested subgroups:
 * 1. Subway (type 0 + 1):
 *    - Heavy rail (Red, Orange, Blue) in fixed order in main routes
 *    - Green Line (type 0) as nested subgroup with branches (B, C, D, E) sorted alphabetically
 * 2. Bus (type 3): sorted numerically then alphanumerically
 * 3. Commuter Rail (type 2): sorted alphabetically by longName
 * 4. Ferry (type 4): sorted alphabetically by longName
 *
 * @param {Array<Object>} metadata — array of {id, color, shortName, longName, type}
 * @returns {Array<{group: string, routes: Array<Object>, subGroups?: Array<{group, routes}>}>}
 */
export function groupAndSortRoutes(metadata) {
    const greenLineRoutes = [];
    const heavyRailRoutes = [];
    const busRoutes = [];
    const commuterRailRoutes = [];
    const ferryRoutes = [];

    // Classify routes by type
    metadata.forEach((route) => {
        if (route.type === 0) {
            // Light Rail (Green Line)
            greenLineRoutes.push(route);
        } else if (route.type === 1) {
            // Heavy Rail (Red, Orange, Blue)
            heavyRailRoutes.push(route);
        } else if (route.type === 2) {
            // Commuter Rail
            commuterRailRoutes.push(route);
        } else if (route.type === 3) {
            // Bus
            busRoutes.push(route);
        } else if (route.type === 4) {
            // Ferry
            ferryRoutes.push(route);
        }
    });

    // Sort Green Line branches by their suffix (B, C, D, E)
    greenLineRoutes.sort((a, b) => {
        const suffixA = a.id.replace('Green-', '');
        const suffixB = b.id.replace('Green-', '');
        return suffixA.localeCompare(suffixB);
    });

    // Sort heavy rail by fixed priority order: Red, Orange, Blue
    const heavyRailOrder = { 'Red': 0, 'Orange': 1, 'Blue': 2 };
    heavyRailRoutes.sort((a, b) => {
        return (heavyRailOrder[a.id] ?? 999) - (heavyRailOrder[b.id] ?? 999);
    });

    // Sort bus routes numerically, then alphanumerically
    busRoutes.sort((a, b) => {
        const numA = parseInt(a.shortName, 10);
        const numB = parseInt(b.shortName, 10);
        const aIsNum = !Number.isNaN(numA);
        const bIsNum = !Number.isNaN(numB);

        // Both are numeric: sort by number
        if (aIsNum && bIsNum) {
            return numA - numB;
        }

        // Only a is numeric: numbers come first
        if (aIsNum) {
            return -1;
        }

        // Only b is numeric: numbers come first
        if (bIsNum) {
            return 1;
        }

        // Both are non-numeric: sort alphabetically
        return a.shortName.localeCompare(b.shortName);
    });

    // Sort Commuter Rail alphabetically by longName
    commuterRailRoutes.sort((a, b) => {
        return (a.longName || '').localeCompare(b.longName || '');
    });

    // Sort Ferry alphabetically by longName
    ferryRoutes.sort((a, b) => {
        return (a.longName || '').localeCompare(b.longName || '');
    });

    // Build result with 4-tier structure
    const groups = [];

    // Subway group: heavy rail in routes, Green Line as subgroup
    if (heavyRailRoutes.length > 0 || greenLineRoutes.length > 0) {
        const subwayGroup = {
            group: 'Subway',
            routes: heavyRailRoutes,
        };

        // Add Green Line as subgroup only if it exists
        if (greenLineRoutes.length > 0) {
            subwayGroup.subGroups = [
                {
                    group: 'Green Line',
                    routes: greenLineRoutes,
                }
            ];
        }

        groups.push(subwayGroup);
    }

    // Bus group
    if (busRoutes.length > 0) {
        groups.push({
            group: 'Bus',
            routes: busRoutes,
        });
    }

    // Commuter Rail group
    if (commuterRailRoutes.length > 0) {
        groups.push({
            group: 'Commuter Rail',
            routes: commuterRailRoutes,
        });
    }

    // Ferry group
    if (ferryRoutes.length > 0) {
        groups.push({
            group: 'Ferry',
            routes: ferryRoutes,
        });
    }

    return groups;
}
