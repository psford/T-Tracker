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
    // Test 1: Basic stop with single route
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

    // Test 2: Multi-route stop
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
 * Test direction-based alert buttons in popup
 */
function testDirectionButtons() {
    const stop = { id: '70019', name: 'Park Street', latitude: 42.3569, longitude: -71.0625 };
    const routes = [{ id: 'Red', shortName: 'Red', longName: 'Red Line', color: '#DA291C', type: 1 }];

    // No routeDirections: shows count only, no buttons
    const noDirectionsHtml = formatStopPopup(stop, routes, { pairCount: 0, maxPairs: 5 });
    assert.ok(noDirectionsHtml.includes('0/5 alerts configured'), 'Should show alert count');
    assert.ok(!noDirectionsHtml.includes('data-action="set-alert"'), 'Should not show buttons without routeDirections');
    console.log('✓ No routeDirections shows count only');

    // Single route with direction buttons
    const singleRouteHtml = formatStopPopup(stop, routes, {
        pairCount: 0,
        maxPairs: 5,
        existingAlerts: [],
        routeDirections: [
            { routeId: 'Red', routeName: 'Red', dir0Label: 'Ashmont/Braintree', dir1Label: 'Alewife', isTerminus: false },
        ],
    });
    assert.ok(singleRouteHtml.includes('data-action="set-alert"'), 'Should have set-alert buttons');
    assert.ok(singleRouteHtml.includes('data-route-id="Red"'), 'Should have route ID in data attribute');
    assert.ok(singleRouteHtml.includes('data-direction-id="0"'), 'Should have direction 0 button');
    assert.ok(singleRouteHtml.includes('data-direction-id="1"'), 'Should have direction 1 button');
    assert.ok(singleRouteHtml.includes('Ashmont/Braintree'), 'Should show dir0 label');
    assert.ok(singleRouteHtml.includes('Alewife'), 'Should show dir1 label');
    assert.ok(singleRouteHtml.includes('data-stop-id="70019"'), 'Should have stop ID in data attribute');
    // Single route should NOT show route label
    assert.ok(!singleRouteHtml.includes('stop-popup__route-label'), 'Single route should not have route label');
    console.log('✓ Single route direction buttons');

    // Multi-route stop shows route labels
    const multiRouteHtml = formatStopPopup(stop, routes, {
        pairCount: 0,
        maxPairs: 5,
        existingAlerts: [],
        routeDirections: [
            { routeId: 'Red', routeName: 'Red', dir0Label: 'Ashmont', dir1Label: 'Alewife', isTerminus: false },
            { routeId: 'Green-B', routeName: 'Green-B', dir0Label: 'Boston College', dir1Label: 'Park Street', isTerminus: false },
        ],
    });
    assert.ok(multiRouteHtml.includes('stop-popup__route-label'), 'Multi-route should show route labels');
    assert.ok(multiRouteHtml.includes('Red:'), 'Should show Red route label');
    assert.ok(multiRouteHtml.includes('Green-B:'), 'Should show Green-B route label');
    const alertButtons = multiRouteHtml.match(/data-action="set-alert"/g);
    assert.strictEqual(alertButtons.length, 4, 'Should have 4 direction buttons (2 per route)');
    console.log('✓ Multi-route direction buttons with labels');

    // Terminus stop: single button instead of two direction buttons
    const terminusHtml = formatStopPopup(stop, routes, {
        pairCount: 0,
        maxPairs: 5,
        existingAlerts: [],
        routeDirections: [
            { routeId: 'Red', routeName: 'Red', dir0Label: 'Ashmont', dir1Label: 'Alewife', isTerminus: true },
        ],
    });
    assert.ok(terminusHtml.includes('Alert me here'), 'Terminus should show "Alert me here" button');
    assert.ok(terminusHtml.includes('stop-popup__btn--terminus'), 'Should have terminus button class');
    const terminusButtons = terminusHtml.match(/data-action="set-alert"/g);
    assert.strictEqual(terminusButtons.length, 1, 'Terminus should have only 1 button');
    console.log('✓ Terminus stop single button');

    // Already-configured alert shows indicator instead of button
    const configuredHtml = formatStopPopup(stop, routes, {
        pairCount: 1,
        maxPairs: 5,
        existingAlerts: [{ routeId: 'Red', directionId: 0 }],
        routeDirections: [
            { routeId: 'Red', routeName: 'Red', dir0Label: 'Ashmont', dir1Label: 'Alewife', isTerminus: false },
        ],
    });
    assert.ok(configuredHtml.includes('stop-popup__alert-configured'), 'Should show configured indicator');
    // Direction 0 should be indicator, direction 1 should still be a button
    const configuredButtons = configuredHtml.match(/data-action="set-alert"/g);
    assert.strictEqual(configuredButtons.length, 1, 'Should have 1 button (other direction is configured)');
    assert.ok(configuredHtml.includes('data-direction-id="1"'), 'Remaining button should be for direction 1');
    console.log('✓ Already-configured alert shows indicator');

    // Both directions configured: no buttons, both indicators
    const bothConfiguredHtml = formatStopPopup(stop, routes, {
        pairCount: 2,
        maxPairs: 5,
        existingAlerts: [{ routeId: 'Red', directionId: 0 }, { routeId: 'Red', directionId: 1 }],
        routeDirections: [
            { routeId: 'Red', routeName: 'Red', dir0Label: 'Ashmont', dir1Label: 'Alewife', isTerminus: false },
        ],
    });
    const bothButtons = bothConfiguredHtml.match(/data-action="set-alert"/g);
    assert.ok(!bothButtons, 'Should have no buttons when both directions configured');
    const indicators = bothConfiguredHtml.match(/stop-popup__alert-configured/g);
    assert.strictEqual(indicators.length, 2, 'Should have 2 configured indicators');
    console.log('✓ Both directions configured shows indicators');

    // Terminus already configured: shows configured indicator
    const terminusConfiguredHtml = formatStopPopup(stop, routes, {
        pairCount: 1,
        maxPairs: 5,
        existingAlerts: [{ routeId: 'Red', directionId: 0 }],
        routeDirections: [
            { routeId: 'Red', routeName: 'Red', dir0Label: 'Ashmont', dir1Label: 'Alewife', isTerminus: true },
        ],
    });
    assert.ok(terminusConfiguredHtml.includes('Alert active (terminus)'), 'Configured terminus should show active indicator');
    const terminusConfigButtons = terminusConfiguredHtml.match(/data-action="set-alert"/g);
    assert.ok(!terminusConfigButtons, 'Configured terminus should have no buttons');
    console.log('✓ Configured terminus shows indicator');

    // Max pairs reached: no buttons, shows maximum reached message
    const maxHtml = formatStopPopup(stop, routes, { pairCount: 5, maxPairs: 5 });
    assert.ok(maxHtml.includes('5/5 alerts configured (maximum reached)'), 'Should show max reached message');
    assert.ok(!maxHtml.includes('data-action="set-alert"'), 'Should not have buttons when max reached');
    console.log('✓ Max pairs state correct');

    // Counter shows alert count
    const countHtml = formatStopPopup(stop, routes, {
        pairCount: 3,
        maxPairs: 5,
        existingAlerts: [],
        routeDirections: [
            { routeId: 'Red', routeName: 'Red', dir0Label: 'Ashmont', dir1Label: 'Alewife', isTerminus: false },
        ],
    });
    assert.ok(countHtml.includes('3/5 alerts configured'), 'Should show alert count');
    console.log('✓ Counter shows correct alert count');

    // Backward compatibility: formatStopPopup with no configState parameter
    const legacyHtml = formatStopPopup(stop, routes);
    assert.ok(legacyHtml.includes('0/5 alerts configured'), 'Should use default pair count of 0');
    assert.ok(!legacyHtml.includes('data-action="set-alert"'), 'Should not show buttons in legacy mode');
    console.log('✓ Backward compatibility maintained');

    // HTML escaping in direction labels
    const xssHtml = formatStopPopup(stop, routes, {
        pairCount: 0,
        maxPairs: 5,
        existingAlerts: [],
        routeDirections: [
            { routeId: 'Red', routeName: 'Red', dir0Label: '<script>xss</script>', dir1Label: 'Safe Label', isTerminus: false },
        ],
    });
    assert.ok(!xssHtml.includes('<script>xss</script>'), 'Should escape HTML in direction labels');
    assert.ok(xssHtml.includes('&lt;script&gt;'), 'Should contain escaped script tag');
    console.log('✓ HTML escaping in direction labels');

    console.log('✓ All direction button tests passed');
}

/**
 * Run all tests
 */
function runTests() {
    console.log('Running stop-popup formatting function tests...\n');

    testEscapeHtml();
    testFormatStopPopup();
    testDirectionButtons();

    console.log('\n✓ All tests passed!');
}

// Run tests
runTests();
