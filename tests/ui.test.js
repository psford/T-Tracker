// tests/ui.test.js — Unit tests for UI utility functions
import assert from 'assert';
import { groupAndSortRoutes } from '../src/route-sorter.js';

/**
 * Test groupAndSortRoutes function
 */
function testGroupAndSortRoutes() {
    // Test 1: Full network with all three groups (Subway with subgroups, Bus, Commuter Rail)
    // AC2.6, AC2.7, AC2.8, AC2.9
    const fullMetadata = [
        // Green Line (type 0)
        { id: 'Green-D', color: '#00A551', shortName: 'D', longName: 'Green Line D Branch', type: 0 },
        { id: 'Green-C', color: '#00A551', shortName: 'C', longName: 'Green Line C Branch', type: 0 },
        { id: 'Green-B', color: '#00A551', shortName: 'B', longName: 'Green Line B Branch', type: 0 },
        { id: 'Green-E', color: '#00A551', shortName: 'E', longName: 'Green Line E Branch', type: 0 },
        // Heavy Rail (type 1): Red, Orange, Blue
        { id: 'Red', color: '#DA291C', shortName: 'Red', longName: 'Red Line', type: 1 },
        { id: 'Orange', color: '#ED8936', shortName: 'Orange', longName: 'Orange Line', type: 1 },
        { id: 'Blue', color: '#003DA5', shortName: 'Blue', longName: 'Blue Line', type: 1 },
        // Bus (type 3)
        { id: '23', color: '#FFC72C', shortName: '23', longName: '23 - Ruby Street/Charles Street', type: 3 },
        { id: '1', color: '#FFC72C', shortName: '1', longName: '1 - Harvard/Nubian via Mass. Ave.', type: 3 },
        { id: '101', color: '#FFC72C', shortName: '101', longName: '101 - Dudley Station', type: 3 },
        { id: 'SL1', color: '#FF6600', shortName: 'SL1', longName: 'Silver Line 1', type: 3 },
        // Commuter Rail (type 2)
        { id: 'CR-Worcester', color: '#80276C', shortName: 'CR-Worcester', longName: 'Worcester/Framingham Line', type: 2 },
        { id: 'CR-Providence', color: '#80276C', shortName: 'CR-Providence', longName: 'Providence/Stoughton Line', type: 2 },
        // Ferry (type 4)
        { id: 'Boat-F1', color: '#008EAA', shortName: 'Boat-F1', longName: 'Hingham/Hull Ferry', type: 4 },
        { id: 'Boat-F4', color: '#008EAA', shortName: 'Boat-F4', longName: 'Charlestown Ferry', type: 4 },
    ];

    const result = groupAndSortRoutes(fullMetadata);

    // AC2.6: Should have 4 groups (Subway, Bus, Commuter Rail, Ferry)
    assert.strictEqual(result.length, 4, 'Should have 4 groups (Subway, Bus, Commuter Rail, Ferry)');

    // AC2.6 & AC2.7: First group should be Subway with subGroups for Green Line
    assert.strictEqual(result[0].group, 'Subway', 'First group should be Subway');
    assert.strictEqual(result[0].routes.length, 3, 'Subway routes should contain Red, Orange, Blue (3 routes)');
    assert.strictEqual(result[0].subGroups !== undefined, true, 'Subway should have subGroups');
    assert.strictEqual(result[0].subGroups.length, 1, 'Subway should have 1 subgroup (Green Line)');

    // AC2.7: Green Line subgroup should be nested correctly
    assert.strictEqual(result[0].subGroups[0].group, 'Green Line', 'Nested group should be Green Line');
    assert.strictEqual(result[0].subGroups[0].routes.length, 4, 'Green Line should have 4 routes (B, C, D, E)');

    // Green Line branches should be sorted B, C, D, E
    const greenLineIds = result[0].subGroups[0].routes.map((r) => r.id);
    assert.deepStrictEqual(greenLineIds, ['Green-B', 'Green-C', 'Green-D', 'Green-E'], 'Green Line should be sorted B, C, D, E');

    // AC2.6: Heavy rail (Red, Orange, Blue) should be in main Subway routes (not in subGroups)
    const heavyRailIds = result[0].routes.map((r) => r.id);
    assert.deepStrictEqual(heavyRailIds, ['Red', 'Orange', 'Blue'], 'Heavy rail should be Red, Orange, Blue in fixed order');

    // AC2.8: Second group should be Bus, sorted numerically then alphanumerically
    assert.strictEqual(result[1].group, 'Bus', 'Second group should be Bus');
    assert.strictEqual(result[1].routes.length, 4, 'Bus should have 4 routes');
    assert.strictEqual(result[1].subGroups === undefined, true, 'Bus group should not have subGroups');

    const busShortNames = result[1].routes.map((r) => r.shortName);
    assert.deepStrictEqual(busShortNames, ['1', '23', '101', 'SL1'], 'Bus routes should be sorted: numeric (1, 23, 101), then alpha (SL1)');

    // AC2.9: Third group should be Commuter Rail, sorted alphabetically by longName
    assert.strictEqual(result[2].group, 'Commuter Rail', 'Third group should be Commuter Rail');
    assert.strictEqual(result[2].routes.length, 2, 'Commuter Rail should have 2 routes');
    assert.strictEqual(result[2].subGroups === undefined, true, 'Commuter Rail group should not have subGroups');

    const crLongNames = result[2].routes.map((r) => r.longName);
    assert.deepStrictEqual(crLongNames, ['Providence/Stoughton Line', 'Worcester/Framingham Line'], 'Commuter Rail should be sorted alphabetically by longName');

    // AC2.1, AC2.2, AC2.3: Fourth group should be Ferry, sorted alphabetically by longName
    assert.strictEqual(result[3].group, 'Ferry', 'Fourth group should be Ferry');
    assert.strictEqual(result[3].routes.length, 2, 'Ferry should have 2 routes');
    assert.strictEqual(result[3].subGroups === undefined, true, 'Ferry group should not have subGroups');

    const ferryLongNames = result[3].routes.map((r) => r.longName);
    assert.deepStrictEqual(ferryLongNames, ['Charlestown Ferry', 'Hingham/Hull Ferry'], 'Ferry routes should be sorted alphabetically by longName');

    // Test 2: Only subway routes (Green Line + Heavy Rail)
    const subwayOnly = [
        { id: 'Green-E', color: '#00A551', shortName: 'E', longName: 'Green Line E Branch', type: 0 },
        { id: 'Green-B', color: '#00A551', shortName: 'B', longName: 'Green Line B Branch', type: 0 },
        { id: 'Red', color: '#DA291C', shortName: 'Red', longName: 'Red Line', type: 1 },
    ];
    const result2 = groupAndSortRoutes(subwayOnly);
    assert.strictEqual(result2.length, 1, 'Should have 1 group (Subway only)');
    assert.strictEqual(result2[0].group, 'Subway', 'Group should be Subway');
    assert.strictEqual(result2[0].routes.length, 1, 'Subway routes should have Red only');
    assert.strictEqual(result2[0].subGroups.length, 1, 'Subway should have Green Line subgroup');

    // Test 3: Only bus routes
    const busOnly = [
        { id: '50', color: '#FFC72C', shortName: '50', longName: '50 - Cleary Square', type: 3 },
        { id: 'CT1', color: '#FFC72C', shortName: 'CT1', longName: 'Crosstown 1', type: 3 },
        { id: '5', color: '#FFC72C', shortName: '5', longName: '5 - Riverway', type: 3 },
    ];
    const result3 = groupAndSortRoutes(busOnly);
    assert.strictEqual(result3.length, 1, 'Should have 1 group (Bus only)');
    assert.strictEqual(result3[0].group, 'Bus', 'Group should be Bus');
    assert.strictEqual(result3[0].routes.length, 3, 'Bus should have 3 routes');
    assert.strictEqual(result3[0].subGroups === undefined, true, 'Bus group should not have subGroups');
    assert.deepStrictEqual(
        result3[0].routes.map((r) => r.shortName),
        ['5', '50', 'CT1'],
        'Bus routes should be sorted: numeric (5, 50), then alpha (CT1)'
    );

    // Test 4: Only commuter rail
    const crOnly = [
        { id: 'CR-Worcester', color: '#80276C', shortName: 'CR-Worcester', longName: 'Worcester/Framingham Line', type: 2 },
        { id: 'CR-Providence', color: '#80276C', shortName: 'CR-Providence', longName: 'Providence/Stoughton Line', type: 2 },
        { id: 'CR-Franklin', color: '#80276C', shortName: 'CR-Franklin', longName: 'Franklin Line', type: 2 },
    ];
    const result4 = groupAndSortRoutes(crOnly);
    assert.strictEqual(result4.length, 1, 'Should have 1 group (Commuter Rail only)');
    assert.strictEqual(result4[0].group, 'Commuter Rail', 'Group should be Commuter Rail');
    assert.strictEqual(result4[0].routes.length, 3, 'Commuter Rail should have 3 routes');
    const crNames = result4[0].routes.map((r) => r.longName);
    assert.deepStrictEqual(crNames, ['Franklin Line', 'Providence/Stoughton Line', 'Worcester/Framingham Line'], 'Commuter Rail should be sorted alphabetically by longName');

    // Test 5: Empty array
    const result5 = groupAndSortRoutes([]);
    assert.strictEqual(result5.length, 0, 'Empty array should return empty groups');

    // Test 6: Subway without Green Line (only Heavy Rail)
    const heavyRailOnly = [
        { id: 'Red', color: '#DA291C', shortName: 'Red', longName: 'Red Line', type: 1 },
        { id: 'Orange', color: '#ED8936', shortName: 'Orange', longName: 'Orange Line', type: 1 },
        { id: 'Blue', color: '#003DA5', shortName: 'Blue', longName: 'Blue Line', type: 1 },
    ];
    const result6 = groupAndSortRoutes(heavyRailOnly);
    assert.strictEqual(result6.length, 1, 'Should have 1 group (Subway only)');
    assert.strictEqual(result6[0].group, 'Subway', 'Group should be Subway');
    assert.strictEqual(result6[0].routes.length, 3, 'Subway should have 3 routes');
    assert.strictEqual(result6[0].subGroups === undefined, true, 'Subway should not have subGroups when no Green Line');

    // Test 7: Only ferry routes
    const ferryOnly = [
        { id: 'Boat-F4', color: '#008EAA', shortName: 'Boat-F4', longName: 'Charlestown Ferry', type: 4 },
        { id: 'Boat-F1', color: '#008EAA', shortName: 'Boat-F1', longName: 'Hingham/Hull Ferry', type: 4 },
        { id: 'Boat-EastBoston', color: '#008EAA', shortName: 'Boat-EastBoston', longName: 'East Boston Ferry', type: 4 },
    ];
    const result7 = groupAndSortRoutes(ferryOnly);
    assert.strictEqual(result7.length, 1, 'Should have 1 group (Ferry only)');
    assert.strictEqual(result7[0].group, 'Ferry', 'Group should be Ferry');
    assert.strictEqual(result7[0].routes.length, 3, 'Ferry should have 3 routes');
    assert.strictEqual(result7[0].subGroups === undefined, true, 'Ferry group should not have subGroups');
    const ferryNames = result7[0].routes.map(r => r.longName);
    assert.deepStrictEqual(ferryNames, ['Charlestown Ferry', 'East Boston Ferry', 'Hingham/Hull Ferry'], 'Ferry routes should be sorted alphabetically by longName');

    // AC2.6 (edge case): Existing test data with no ferry routes returns 3 groups
    // This test implicitly covers the edge case where no ferry routes exist, no Ferry group appears

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
