// src/route-sorter.js — Pure function for organizing and sorting route metadata
// Extracted from ui.js for testability (no browser dependencies)

/**
 * Organizes route metadata into groups with sorting:
 * 1. Green Line branches (B, C, D, E) sorted alphabetically
 * 2. Bus routes sorted numerically
 *
 * @param {Array<Object>} metadata — array of {id, color, shortName, type}
 * @returns {Array<{group: string, routes: Array<Object>}>}
 */
export function groupAndSortRoutes(metadata) {
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

    const groups = [];
    if (greenLineRoutes.length > 0) {
        groups.push({ group: 'Green Line', routes: greenLineRoutes });
    }
    if (busRoutes.length > 0) {
        groups.push({ group: 'Bus Routes', routes: busRoutes });
    }

    return groups;
}
