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
    assert(!result4.includes('CR-Providence'), 'Should not include shortName for commuter rail');
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
 * Run all tests
 */
function runTests() {
    console.log('Running stop-popup formatting function tests...\n');

    testEscapeHtml();
    testFormatStopPopup();

    console.log('\n✓ All tests passed!');
}

// Run tests
runTests();
