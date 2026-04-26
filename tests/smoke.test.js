/**
 * Smoke test for n8n-nodes-openinbox.
 *
 * Verifies the compiled nodes and credential meet the structural contract
 * that n8n requires when loading a community node package. This catches the
 * most common publish-time mistakes (missing exports, broken `properties`,
 * wrong `displayName`, missing `n8n` field in package.json).
 *
 * Run with: `npm test`
 */

const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));

let failed = 0;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed += 1;
  } catch (err) {
    failed += 1;
    console.error(`  \u2717 ${name}`);
    console.error(`    ${err.message}`);
  }
}

console.log(`\nn8n-nodes-openinbox v${pkg.version} — smoke tests\n`);

// ── package.json contract ────────────────────────────────────────────────────
test('package.json declares an `n8n` block with credentials and nodes', () => {
  assert.ok(pkg.n8n, 'package.json is missing the `n8n` field');
  assert.equal(pkg.n8n.n8nNodesApiVersion, 1, 'n8nNodesApiVersion must be 1');
  assert.ok(
    Array.isArray(pkg.n8n.credentials) && pkg.n8n.credentials.length > 0,
  );
  assert.ok(Array.isArray(pkg.n8n.nodes) && pkg.n8n.nodes.length > 0);
});

test('package.json keywords include `n8n-community-node-package`', () => {
  assert.ok(
    Array.isArray(pkg.keywords) &&
      pkg.keywords.includes('n8n-community-node-package'),
    'Required keyword missing — n8n will reject the package without it.',
  );
});

test('every entry in `n8n.credentials` and `n8n.nodes` exists on disk', () => {
  for (const rel of [...pkg.n8n.credentials, ...pkg.n8n.nodes]) {
    const abs = path.join(root, rel);
    assert.ok(
      fs.existsSync(abs),
      `Missing build output: ${rel}. Did you run \`npm run build\`?`,
    );
  }
});

// ── Credentials ──────────────────────────────────────────────────────────────
test('OpenInboxApi credential exports a class with required fields', () => {
  const mod = require(path.join(root, pkg.n8n.credentials[0]));
  const exportedName = Object.keys(mod)[0];
  const Credential = mod[exportedName];
  assert.ok(Credential, 'Credential class is not exported');
  const inst = new Credential();
  assert.equal(typeof inst.name, 'string', 'credential.name must be a string');
  assert.equal(
    typeof inst.displayName,
    'string',
    'credential.displayName must be a string',
  );
  assert.ok(
    Array.isArray(inst.properties) && inst.properties.length > 0,
    'credential.properties must be a non-empty array',
  );
});

// ── Nodes ────────────────────────────────────────────────────────────────────
for (const rel of pkg.n8n.nodes) {
  const file = path.basename(rel);
  test(`${file} loads and exposes a valid node description`, () => {
    const mod = require(path.join(root, rel));
    const exportedName = Object.keys(mod)[0];
    const Node = mod[exportedName];
    assert.ok(Node, `Node class not exported from ${rel}`);
    const inst = new Node();
    const desc = inst.description;
    assert.ok(desc, `${exportedName}.description is missing`);
    assert.equal(typeof desc.name, 'string');
    assert.equal(typeof desc.displayName, 'string');
    assert.ok(
      Array.isArray(desc.group) && desc.group.length > 0,
      'description.group must be a non-empty array',
    );
    assert.equal(typeof desc.version, 'number');
    assert.ok(Array.isArray(desc.inputs), 'description.inputs missing');
    assert.ok(Array.isArray(desc.outputs), 'description.outputs missing');
    assert.ok(Array.isArray(desc.properties), 'description.properties missing');
  });
}

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
