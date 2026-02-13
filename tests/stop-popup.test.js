// tests/stop-popup.test.js — Unit tests for stop popup formatting functions
import assert from 'assert';
import { formatStopPopup, escapeHtml } from '../src/stop-popup.js';

/**
 * Test escapeHtml function
 */
function testEscapeHtml() {
    // Test ampersand
    assert.strictEqual(
        escapeHtml('O\'Brien & Co'),
        'O&#39;Brien &amp; Co',
        'Should escape ampersand and apostrophe'
    );

    // Test angle brackets
    assert.strictEqual(
        escapeHtml('<script>alert("xss")</script>'),
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
        'Should escape angle brackets and quotes'
    );

    // Test double quotes
    assert.strictEqual(
        escapeHtml('He said "hello"'),
        'He said &quot;hello&quot;',
        'Should escape double quotes'
    );

    // Test empty string
    assert.strictEqual(
        escapeHtml(''),
        '',
        'Empty string should return empty string'
    );

    // Test null
    assert.strictEqual(
        escapeHtml(null),
        '',
        'null should return empty string'
    );

    console.log('✓ escapeHtml tests passed');
}

/**
 * Test formatStopPopup function
 */
function testFormatStopPopup() {
    // Test 1: Basic stop with single route (AC2.1 and AC2.3)
    const stop1 = {
        id: 'place-downtown',
        name: 'Downtown Crossing',
        latitude: 42.3563,
        longitude: -71.0597,
    };

    const routeInfos1 = [
        {
            id: 'Red',
            shortName: 'Red',
            longName: 'Red Line',
            color: '#DA291C',
            type: 1,
        },
    ];

    const result1 = formatStopPopup(stop1, routeInfos1);

    assert(result1.includes('class="stop-popup__name"'), 'Should contain stop-popup__name class');
    assert(result1.includes('Downtown Crossing'), 'Should include stop name');
    assert(result1.includes('class="stop-popup__routes"'), 'Should contain routes container');
    assert(result1.includes('class="stop-popup__route"'), 'Should contain route div');
    assert(result1.includes('Red'), 'Should include route short name for subway');
    assert(result1.includes('#DA291C'), 'Should include route color');
    assert(result1.includes('class="stop-popup__swatch"'), 'Should contain color swatch');
    assert(result1.includes('class="stop-popup__actions"'), 'Should contain actions div');
    assert(!result1.includes('Red Line'), 'Should not include longName for subway');

    console.log('✓ formatStopPopup basic test passed');

    // Test 2: Multi-route stop (AC2.3 - multiple routes)
    const stop2 = {
        id: 'place-park',
        name: 'Park Street',
        latitude: 42.3569,
        longitude: -71.0625,
    };

    const routeInfos2 = [
        {
            id: 'Red',
            shortName: 'Red',
            longName: 'Red Line',
            color: '#DA291C',
            type: 1,
        },
        {
            id: 'Green-B',
            shortName: 'Green-B',
            longName: 'Green Line B Branch',
            color: '#00843D',
            type: 1,
        },
    ];

    const result2 = formatStopPopup(stop2, routeInfos2);

    assert(result2.includes('Park Street'), 'Should include stop name');
    // Count route divs - should be 2
    const routeMatches = result2.match(/class="stop-popup__route"/g);
    assert(routeMatches && routeMatches.length === 2, 'Should have 2 route divs for multi-route stop');
    assert(result2.includes('Red'), 'Should include first route');
    assert(result2.includes('Green-B'), 'Should include second route');
    assert(result2.includes('#DA291C'), 'Should include first route color');
    assert(result2.includes('#00843D'), 'Should include second route color');

    console.log('✓ formatStopPopup multi-route test passed');

    // Test 3: Stop with no routes
    const stop3 = {
        id: 'place-empty',
        name: 'Empty Stop',
        latitude: 42.3569,
        longitude: -71.0625,
    };

    const result3 = formatStopPopup(stop3, []);

    assert(result3.includes('Empty Stop'), 'Should include stop name');
    assert(result3.includes('class="stop-popup__routes"'), 'Should contain routes container');
    // Should have only the opening/closing div tags, no route divs
    const routeMatches3 = result3.match(/class="stop-popup__route"/g);
    assert(!routeMatches3 || routeMatches3.length === 0, 'Should have no route divs for empty routes');

    console.log('✓ formatStopPopup empty routes test passed');

    // Test 4: Commuter Rail route (uses longName)
    const stop4 = {
        id: 'place-union',
        name: 'Union Station',
        latitude: 42.3958,
        longitude: -71.0096,
    };

    const routeInfos4 = [
        {
            id: 'CR-Providence',
            shortName: 'CR-Providence',
            longName: 'Providence/Stoughton Line',
            color: '#80276C',
            type: 2,
        },
    ];

    const result4 = formatStopPopup(stop4, routeInfos4);

    assert(result4.includes('Union Station'), 'Should include stop name');
    assert(result4.includes('Providence/Stoughton Line'), 'Should include longName for commuter rail');
    // Verify shortName is only in data attributes, not in visible route name
    // The visible part is between <span> tags after the swatch, containing only the route name
    const visibleRouteMatch = result4.match(/<span class="stop-popup__swatch"[\s\S]*?<\/span>[\s\S]*?<span>([\s\S]*?)<\/span>/);
    assert(visibleRouteMatch, 'Should have route name in visible span');
    assert(!visibleRouteMatch[1].includes('CR-Providence'), 'Visible route text should not include shortName for commuter rail');
    assert(result4.includes('#80276C'), 'Should include route color');

    console.log('✓ formatStopPopup commuter rail test passed');

    // Test 5: HTML special characters in stop name (security)
    const stop5 = {
        id: 'place-special',
        name: 'O\'Brien & Sons <Station>',
        latitude: 42.3569,
        longitude: -71.0625,
    };

    const routeInfos5 = [
        {
            id: 'Red',
            shortName: 'Red',
            color: '#DA291C',
            type: 1,
        },
    ];

    const result5 = formatStopPopup(stop5, routeInfos5);

    assert(result5.includes('O&#39;Brien &amp; Sons &lt;Station&gt;'), 'Should escape HTML in stop name');
    assert(!result5.includes('<Station>'), 'Should not contain unescaped angle brackets');

    console.log('✓ formatStopPopup HTML escaping test passed');

    // Test 6: Null routeInfos
    const stop6 = {
        id: 'place-null',
        name: 'Test Stop',
        latitude: 42.3569,
        longitude: -71.0625,
    };

    const result6 = formatStopPopup(stop6, null);

    assert(result6.includes('Test Stop'), 'Should include stop name');
    assert(result6.includes('class="stop-popup__routes"'), 'Should contain routes container');
    const routeMatches6 = result6.match(/class="stop-popup__route"/g);
    assert(!routeMatches6 || routeMatches6.length === 0, 'Should handle null routeInfos gracefully');

    console.log('✓ formatStopPopup null routeInfos test passed');

    // Test 7: Route with missing optional fields
    const stop7 = {
        id: 'place-missing',
        name: 'Missing Fields Stop',
        latitude: 42.3569,
        longitude: -71.0625,
    };

    const routeInfos7 = [
        {
            id: 'Unknown',
            // shortName and longName missing
            type: 1,
        },
    ];

    const result7 = formatStopPopup(stop7, routeInfos7);

    assert(result7.includes('Missing Fields Stop'), 'Should include stop name');
    assert(result7.includes('Unknown'), 'Should use route id as fallback when names missing');
    assert(result7.includes('#888888'), 'Should use gray fallback color when color missing');

    console.log('✓ formatStopPopup missing fields test passed');

    console.log('✓ All formatStopPopup tests passed');
}

/**
 * Test notification config state parameters
 */
function testConfigButtons() {
    const stop = { id: '70019', name: 'Park Street', latitude: 42.3569, longitude: -71.0625 };
    const routes = [{ id: 'Red', shortName: 'Red', longName: 'Red Line', color: '#DA291C', type: 1 }];

    // AC2.2: Default state shows both buttons
    const defaultHtml = formatStopPopup(stop, routes, { pairCount: 0, maxPairs: 5 });
    assert.ok(defaultHtml.includes('data-action="set-checkpoint"'), 'Should have set-checkpoint button');
    assert.ok(defaultHtml.includes('data-action="set-destination"'), 'Should have set-destination button');
    assert.ok(defaultHtml.includes('Set as Checkpoint'), 'Should have checkpoint button text');
    assert.ok(defaultHtml.includes('Set as My Stop'), 'Should have destination button text');
    assert.ok(defaultHtml.includes('data-stop-id="70019"'), 'Should have stop ID in data attribute');
    console.log('✓ Default state shows both buttons');

    // AC3.7: Counter shows pair count
    const countHtml = formatStopPopup(stop, routes, { pairCount: 3, maxPairs: 5 });
    assert.ok(countHtml.includes('3/5 pairs configured'), 'Should show pair count');
    console.log('✓ Counter shows correct pair count');

    // Pending checkpoint state: shows pending message and only set-destination button
    const pendingHtml = formatStopPopup(stop, routes, {
        pairCount: 2,
        maxPairs: 5,
        pendingCheckpoint: 'place-downtown',
    });
    assert.ok(pendingHtml.includes('Checkpoint: place-downtown'), 'Should show pending checkpoint');
    assert.ok(pendingHtml.includes('data-action="set-destination"'), 'Should have set-destination button');
    assert.ok(!pendingHtml.includes('data-action="set-checkpoint"'), 'Should not have set-checkpoint button when pending');
    assert.ok(pendingHtml.includes('stop-popup__btn--active'), 'Should have active class on destination button');
    console.log('✓ Pending checkpoint state correct');

    // Already configured as checkpoint shows indicator, no buttons
    const checkpointHtml = formatStopPopup(stop, routes, { isCheckpoint: true, pairCount: 1, maxPairs: 5 });
    assert.ok(checkpointHtml.includes('Checkpoint'), 'Should show checkpoint indicator');
    assert.ok(!checkpointHtml.includes('data-action="set-checkpoint"'), 'Should not have checkpoint button');
    assert.ok(!checkpointHtml.includes('data-action="set-destination"'), 'Should not have destination button');
    console.log('✓ Configured as checkpoint state correct');

    // Already configured as destination shows indicator, no buttons
    const destinationHtml = formatStopPopup(stop, routes, { isDestination: true, pairCount: 1, maxPairs: 5 });
    assert.ok(destinationHtml.includes('Destination'), 'Should show destination indicator');
    assert.ok(!destinationHtml.includes('data-action="set-checkpoint"'), 'Should not have checkpoint button');
    assert.ok(!destinationHtml.includes('data-action="set-destination"'), 'Should not have destination button');
    console.log('✓ Configured as destination state correct');

    // Max pairs reached shows max message, no buttons
    const maxHtml = formatStopPopup(stop, routes, { pairCount: 5, maxPairs: 5 });
    assert.ok(maxHtml.includes('5/5 pairs configured (maximum reached)'), 'Should show max reached message');
    assert.ok(!maxHtml.includes('data-action="set-checkpoint"'), 'Should not have checkpoint button when max reached');
    assert.ok(!maxHtml.includes('data-action="set-destination"'), 'Should not have destination button when max reached');
    console.log('✓ Max pairs state correct');

    // Data attributes for route IDs
    const routeIdsHtml = formatStopPopup(stop, routes, { pairCount: 0, maxPairs: 5 });
    assert.ok(routeIdsHtml.includes('data-route-ids="Red"'), 'Should have route IDs in data attribute');
    console.log('✓ Route IDs in data attribute');

    // Multiple routes - route IDs comma-separated
    const multiRouteStop = { id: '70020', name: 'Downtown Crossing', latitude: 42.3563, longitude: -71.0597 };
    const multiRoutes = [
        { id: 'Red', shortName: 'Red', longName: 'Red Line', color: '#DA291C', type: 1 },
        { id: 'Orange', shortName: 'Orange', longName: 'Orange Line', color: '#ED8936', type: 1 },
    ];
    const multiHtml = formatStopPopup(multiRouteStop, multiRoutes, { pairCount: 0, maxPairs: 5 });
    assert.ok(multiHtml.includes('data-route-ids="Red,Orange"'), 'Should have comma-separated route IDs');
    console.log('✓ Multiple route IDs in data attribute');

    // Backward compatibility: formatStopPopup with no configState parameter (defaults to {})
    const legacyHtml = formatStopPopup(stop, routes);
    assert.ok(legacyHtml.includes('data-action="set-checkpoint"'), 'Should work with default configState (no param)');
    assert.ok(legacyHtml.includes('0/5 pairs configured'), 'Should use default pair count of 0');
    console.log('✓ Backward compatibility maintained');

    console.log('✓ config button tests passed');
}

/**
 * Run all tests
 */
function runTests() {
    console.log('Running stop-popup formatting function tests...\n');

    testEscapeHtml();
    testFormatStopPopup();
    testConfigButtons();

    console.log('\n✓ All tests passed!');
}

// Run tests
runTests();
