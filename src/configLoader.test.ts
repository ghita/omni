import test, { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadAgentConfigs, loadToolNames } from './configLoader';

function createTempJsonFile(t: TestContext, content: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-config-test-'));
  const filePath = path.join(dir, 'config.json');
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.writeFileSync(filePath, JSON.stringify(content), 'utf-8');
  return filePath;
}

test('loadToolNames supports array and object formats', (t) => {
  const arrayFile = createTempJsonFile(t, ['joke_tool', { name: 'report_work_done' }]);
  assert.deepEqual(loadToolNames(arrayFile), ['joke_tool', 'report_work_done']);

  const objectFile = createTempJsonFile(t, { tools: ['joke_tool', { name: 'report_work_done' }] });
  assert.deepEqual(loadToolNames(objectFile), ['joke_tool', 'report_work_done']);
});

test('loadToolNames throws helpful error for invalid format', (t) => {
  const invalidFile = createTempJsonFile(t, { tools: [42] });
  assert.throws(() => loadToolNames(invalidFile), /Invalid tools file format/);
});

test('loadAgentConfigs supports single object and array', (t) => {
  const singleAgent = {
    name: 'joke-teller',
    prompt: 'Tell a joke',
    displayName: 'Joke Teller',
  };
  const singleFile = createTempJsonFile(t, singleAgent);
  assert.equal(loadAgentConfigs(singleFile).length, 1);

  const arrayFile = createTempJsonFile(t, [singleAgent, { name: 'other', prompt: 'Other prompt' }]);
  assert.equal(loadAgentConfigs(arrayFile).length, 2);
});

test('loadAgentConfigs returns empty list when path is undefined', () => {
  assert.deepEqual(loadAgentConfigs(undefined), []);
});
