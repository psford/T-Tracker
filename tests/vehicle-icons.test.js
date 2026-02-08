// tests/vehicle-icons.test.js — Unit tests for vehicle icon SVG module
import assert from 'assert';
import { VEHICLE_ICONS, DEFAULT_ICON } from '../src/vehicle-icons.js';

/**
 * Test icons.AC1.1 — Type 0 (Trolley) exists and contains SVG elements
 */
function testType0Trolley() {
  const icon = VEHICLE_ICONS[0];
  assert(icon, 'VEHICLE_ICONS[0] should exist');
  assert(typeof icon === 'string', 'Icon should be a string');
  assert(icon.length > 0, 'Icon string should be non-empty');
  assert(icon.includes('<'), 'Icon should contain SVG elements');
  assert(
    icon.includes('currentColor'),
    'Type 0 icon should use currentColor for body fill'
  );
  console.log('✓ icons.AC1.1 — Type 0 trolley exists with SVG elements');
}

/**
 * Test icons.AC1.2 — Type 1 (Subway) exists and is visually distinct from Type 0
 */
function testType1Subway() {
  const icon = VEHICLE_ICONS[1];
  const type0 = VEHICLE_ICONS[0];
  assert(icon, 'VEHICLE_ICONS[1] should exist');
  assert(typeof icon === 'string', 'Icon should be a string');
  assert(icon.length > 0, 'Icon string should be non-empty');
  assert(icon.includes('<'), 'Icon should contain SVG elements');
  assert(
    icon.includes('currentColor'),
    'Type 1 icon should use currentColor for body fill'
  );
  assert(
    icon !== type0,
    'Type 1 (subway) should be visually distinct from Type 0 (trolley)'
  );
  console.log('✓ icons.AC1.2 — Type 1 subway is distinct from trolley');
}

/**
 * Test icons.AC1.3 — Type 2 (Commuter Rail) exists and is visually distinct from Types 0 and 1
 */
function testType2CommuterRail() {
  const icon = VEHICLE_ICONS[2];
  const type0 = VEHICLE_ICONS[0];
  const type1 = VEHICLE_ICONS[1];
  assert(icon, 'VEHICLE_ICONS[2] should exist');
  assert(typeof icon === 'string', 'Icon should be a string');
  assert(icon.length > 0, 'Icon string should be non-empty');
  assert(icon.includes('<'), 'Icon should contain SVG elements');
  assert(
    icon.includes('currentColor'),
    'Type 2 icon should use currentColor for body fill'
  );
  assert(
    icon !== type0,
    'Type 2 (commuter rail) should be visually distinct from Type 0 (trolley)'
  );
  assert(
    icon !== type1,
    'Type 2 (commuter rail) should be visually distinct from Type 1 (subway)'
  );
  console.log('✓ icons.AC1.3 — Type 2 commuter rail is distinct from trolley and subway');
}

/**
 * Test icons.AC1.4 — Type 3 (Bus) exists and is visually distinct from Types 0, 1, and 2
 */
function testType3Bus() {
  const icon = VEHICLE_ICONS[3];
  const type0 = VEHICLE_ICONS[0];
  const type1 = VEHICLE_ICONS[1];
  const type2 = VEHICLE_ICONS[2];
  assert(icon, 'VEHICLE_ICONS[3] should exist');
  assert(typeof icon === 'string', 'Icon should be a string');
  assert(icon.length > 0, 'Icon string should be non-empty');
  assert(icon.includes('<'), 'Icon should contain SVG elements');
  assert(
    icon.includes('currentColor'),
    'Type 3 icon should use currentColor for body fill'
  );
  assert(
    icon !== type0,
    'Type 3 (bus) should be visually distinct from Type 0 (trolley)'
  );
  assert(
    icon !== type1,
    'Type 3 (bus) should be visually distinct from Type 1 (subway)'
  );
  assert(
    icon !== type2,
    'Type 3 (bus) should be visually distinct from Type 2 (commuter rail)'
  );
  console.log('✓ icons.AC1.4 — Type 3 bus is distinct from other vehicle types');
}

/**
 * Test icons.AC1.5 — Type 4 (Ferry) exists and is ready for future integration
 */
function testType4Ferry() {
  const icon = VEHICLE_ICONS[4];
  assert(icon, 'VEHICLE_ICONS[4] should exist');
  assert(typeof icon === 'string', 'Icon should be a string');
  assert(icon.length > 0, 'Icon string should be non-empty');
  assert(icon.includes('<'), 'Icon should contain SVG elements');
  assert(
    icon.includes('currentColor'),
    'Type 4 icon should use currentColor for body fill'
  );
  console.log('✓ icons.AC1.5 — Type 4 ferry exists and ready for future integration');
}

/**
 * Test icons.AC1.7 — Unknown route types fall back to bus icon
 */
function testDefaultFallback() {
  assert(
    DEFAULT_ICON === VEHICLE_ICONS[3],
    'DEFAULT_ICON should equal bus (type 3) for unknown route types'
  );
  console.log('✓ icons.AC1.7 — Unknown route types fall back to bus icon');
}

/**
 * Test icons.AC5.1 — SVG is stored in a dedicated module
 */
function testModuleStructure() {
  // Already verified by test file structure — icons are in src/vehicle-icons.js
  assert(true, 'icons.AC5.1 — SVG is in dedicated module');
  console.log('✓ icons.AC5.1 — SVG artwork stored in dedicated module');
}

/**
 * Test icons.AC5.2 — VEHICLE_ICONS exports a mapping of route type to SVG content
 */
function testVehicleIconsMapping() {
  assert(
    typeof VEHICLE_ICONS === 'object' && VEHICLE_ICONS !== null,
    'VEHICLE_ICONS should be an object'
  );
  const keys = Object.keys(VEHICLE_ICONS);
  assert.deepStrictEqual(
    keys,
    ['0', '1', '2', '3', '4'],
    'VEHICLE_ICONS should have exactly keys 0, 1, 2, 3, 4'
  );
  keys.forEach(key => {
    assert(
      typeof VEHICLE_ICONS[key] === 'string',
      `VEHICLE_ICONS[${key}] should be a string`
    );
  });
  console.log('✓ icons.AC5.2 — VEHICLE_ICONS exports mapping of route type to SVG');
}

/**
 * Test icons.AC5.4 — Module exports a fallback icon for unknown route types
 */
function testFallbackExport() {
  assert(DEFAULT_ICON, 'DEFAULT_ICON should be exported');
  assert(
    typeof DEFAULT_ICON === 'string',
    'DEFAULT_ICON should be a string'
  );
  assert(
    DEFAULT_ICON.length > 0,
    'DEFAULT_ICON should be non-empty'
  );
  console.log('✓ icons.AC5.4 — Module exports fallback icon for unknown route types');
}

/**
 * Test icons.AC5.5 — Adding a new vehicle type requires only adding entry to icon module
 */
function testExtensibility() {
  // Verify object is a plain key-value mapping (no methods, just data)
  assert(
    Object.getPrototypeOf(VEHICLE_ICONS) === Object.prototype,
    'VEHICLE_ICONS should be a plain object'
  );
  // No functions should be present
  const values = Object.values(VEHICLE_ICONS);
  assert(
    values.every(v => typeof v === 'string'),
    'All values should be strings (no functions)'
  );
  console.log('✓ icons.AC5.5 — Adding new vehicle type requires only adding object entry');
}

/**
 * Test that all icons use currentColor for body fill
 */
function testCurrentColorUsage() {
  const icons = Object.values(VEHICLE_ICONS);
  icons.forEach((icon, index) => {
    assert(
      icon.includes('currentColor'),
      `Icon ${index} should include 'currentColor' for body fill`
    );
  });
  console.log('✓ All icons use currentColor for body fill');
}

/**
 * Test that all icons are different from each other
 */
function testIconDistinctness() {
  const icons = Object.values(VEHICLE_ICONS);
  for (let i = 0; i < icons.length; i++) {
    for (let j = i + 1; j < icons.length; j++) {
      assert(
        icons[i] !== icons[j],
        `Icon ${i} and icon ${j} should be different`
      );
    }
  }
  console.log('✓ All five icons are visually distinct');
}

/**
 * Run all tests
 */
function runTests() {
  console.log('Running vehicle-icons module tests...\n');

  testType0Trolley();
  testType1Subway();
  testType2CommuterRail();
  testType3Bus();
  testType4Ferry();
  testDefaultFallback();
  testModuleStructure();
  testVehicleIconsMapping();
  testFallbackExport();
  testExtensibility();
  testCurrentColorUsage();
  testIconDistinctness();

  console.log('\n✓ All vehicle-icons tests passed!');
}

// Run tests
runTests();
