// tests/ui.test.js — Unit tests for UI utility functions
import assert from 'assert';
import { groupAndSortRoutes } from '../src/route-sorter.js';

/**
 * Test groupAndSortRoutes function
 */
function testGroupAndSortRoutes() {
    // Test with mixed Green Line and Bus routes
    const metadata = [
        { id: 'Green-D', color: '#00A551', shortName: 'D', type: 0 },
        { id: '23', color: '#FFC72C', shortName: '23', type: 3 },
        { id: 'Green-C', color: '#00A551', shortName: 'C', type: 0 },
        { id: '1', color: '#FFC72C', shortName: '1', type: 3 },
        { id: 'Green-B', color: '#00A551', shortName: 'B', type: 0 },
        { id: '101', color: '#FFC72C', shortName: '101', type: 3 },
        { id: 'Green-E', color: '#00A551', shortName: 'E', type: 0 },
        { id: 'SL1', color: '#FF6600', shortName: 'SL1', type: 3 },
    ];

    const result = groupAndSortRoutes(metadata);

    // Should have 2 groups (Green Line and Bus)
    assert.strictEqual(result.length, 2, 'Should have 2 groups (Green Line and Bus)');

    // First group should be Green Line
    assert.strictEqual(result[0].group, 'Green Line', 'First group should be Green Line');
    assert.strictEqual(result[0].routes.length, 4, 'Green Line should have 4 routes');

    // Green Line routes should be sorted: B, C, D, E
    const greenLineIds = result[0].routes.map((r) => r.id);
    assert.deepStrictEqual(greenLineIds, ['Green-B', 'Green-C', 'Green-D', 'Green-E'], 'Green Line should be sorted B, C, D, E');

    // Second group should be Bus Routes
    assert.strictEqual(result[1].group, 'Bus Routes', 'Second group should be Bus Routes');
    assert.strictEqual(result[1].routes.length, 4, 'Bus Routes should have 4 routes');

    // Bus routes should be sorted: numeric first (1, 23, 101), then alpha (SL1)
    const busRoutes = result[1].routes;
    assert.strictEqual(busRoutes[0].shortName, '1', 'First bus route should be numeric 1');
    assert.strictEqual(busRoutes[1].shortName, '23', 'Second bus route should be numeric 23');
    assert.strictEqual(busRoutes[2].shortName, '101', 'Third bus route should be numeric 101');
    assert.strictEqual(busRoutes[3].shortName, 'SL1', 'Fourth bus route should be alpha SL1');

    // Test with only Green Line routes
    const greenOnly = [
        { id: 'Green-E', color: '#00A551', shortName: 'E', type: 0 },
        { id: 'Green-B', color: '#00A551', shortName: 'B', type: 0 },
    ];
    const result2 = groupAndSortRoutes(greenOnly);
    assert.strictEqual(result2.length, 1, 'Should have 1 group (Green Line only)');
    assert.strictEqual(result2[0].group, 'Green Line', 'Group should be Green Line');
    assert.deepStrictEqual(
        result2[0].routes.map((r) => r.id),
        ['Green-B', 'Green-E'],
        'Green Line should be sorted B, E'
    );

    // Test with only Bus routes
    const busOnly = [
        { id: '50', color: '#FFC72C', shortName: '50', type: 3 },
        { id: 'CT1', color: '#FFC72C', shortName: 'CT1', type: 3 },
        { id: '5', color: '#FFC72C', shortName: '5', type: 3 },
    ];
    const result3 = groupAndSortRoutes(busOnly);
    assert.strictEqual(result3.length, 1, 'Should have 1 group (Bus Routes only)');
    assert.strictEqual(result3[0].group, 'Bus Routes', 'Group should be Bus Routes');
    // Numeric: 5, 50; then alpha: CT1
    assert.deepStrictEqual(
        result3[0].routes.map((r) => r.shortName),
        ['5', '50', 'CT1'],
        'Bus routes should be sorted: numeric (5, 50), then alpha (CT1)'
    );

    // Test empty array
    const result4 = groupAndSortRoutes([]);
    assert.strictEqual(result4.length, 0, 'Empty array should return empty groups');

    console.log('✓ groupAndSortRoutes tests passed');
}

/**
 * Run all tests
 */
function runTests() {
    console.log('Running UI utility tests...\n');
    testGroupAndSortRoutes();
    console.log('\n✓ All UI tests passed!');
}

// Run tests
runTests();
