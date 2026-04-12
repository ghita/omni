import test, { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  loadAgentConfigs,
  loadRuntimeCliConfig,
  loadToolNames,
  resolveDefaultRuntimeConfigPath,
  resolveDialogueConfig,
} from './configLoader';

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

test('loadRuntimeCliConfig returns empty object when path is undefined', () => {
  assert.deepEqual(loadRuntimeCliConfig(undefined), {});
});

test('loadRuntimeCliConfig reads valid runtime options', (t) => {
  const runtimeFile = createTempJsonFile(t, {
    agentFile: './config/agent1.json',
    toolsFile: './config/tools.json',
    interactive: true,
    maxTurns: '15',
    telemetryCaptureContent: true,
  });

  const config = loadRuntimeCliConfig(runtimeFile);
  assert.equal(config.agentFile, './config/agent1.json');
  assert.equal(config.toolsFile, './config/tools.json');
  assert.equal(config.interactive, true);
  assert.equal(config.maxTurns, 15);
  assert.equal(config.telemetryCaptureContent, true);
});

test('loadRuntimeCliConfig throws helpful error for invalid format', (t) => {
  const runtimeFile = createTempJsonFile(t, {
    maxTurns: 0,
  });

  assert.throws(() => loadRuntimeCliConfig(runtimeFile), /Invalid runtime config format/);
});

test('loadRuntimeCliConfig throws when required file is missing', () => {
  const missingPath = path.join(os.tmpdir(), `omni-missing-${Date.now()}.json`);
  assert.throws(() => loadRuntimeCliConfig(missingPath, true), /Runtime config file not found/);
});

test('resolveDefaultRuntimeConfigPath prefers executable directory over cwd', (t) => {
  const execDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-exec-dir-'));
  const cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-cwd-dir-'));
  t.after(() => {
    fs.rmSync(execDir, { recursive: true, force: true });
    fs.rmSync(cwdDir, { recursive: true, force: true });
  });

  const execConfig = path.join(execDir, 'runtimeConfig.json');
  fs.writeFileSync(execConfig, JSON.stringify({ interactive: true }), 'utf-8');
  fs.writeFileSync(path.join(cwdDir, 'runtimeConfig.json'), JSON.stringify({ interactive: false }), 'utf-8');

  const resolved = resolveDefaultRuntimeConfigPath(path.join(execDir, 'cli.js'), cwdDir);
  assert.equal(resolved, execConfig);
});

test('resolveDefaultRuntimeConfigPath falls back to cwd', (t) => {
  const execDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-exec-fallback-'));
  const cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-cwd-fallback-'));
  t.after(() => {
    fs.rmSync(execDir, { recursive: true, force: true });
    fs.rmSync(cwdDir, { recursive: true, force: true });
  });

  const cwdConfig = path.join(cwdDir, 'runtimeConfig.json');
  fs.writeFileSync(cwdConfig, JSON.stringify({ interactive: true }), 'utf-8');

  const resolved = resolveDefaultRuntimeConfigPath(path.join(execDir, 'cli.js'), cwdDir);
  assert.equal(resolved, cwdConfig);
});

test('resolveDefaultRuntimeConfigPath returns undefined when no config exists', (t) => {
  const execDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-exec-none-'));
  const cwdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omni-cwd-none-'));
  t.after(() => {
    fs.rmSync(execDir, { recursive: true, force: true });
    fs.rmSync(cwdDir, { recursive: true, force: true });
  });

  const resolved = resolveDefaultRuntimeConfigPath(path.join(execDir, 'cli.js'), cwdDir);
  assert.equal(resolved, undefined);
});

test('resolveDialogueConfig returns undefined when dialogue mode is disabled', () => {
  const result = resolveDialogueConfig({}, [
    { name: 'seller', prompt: 'Sell gold' },
    { name: 'buyer', prompt: 'Buy gold' },
  ]);
  assert.equal(result, undefined);
});

test('resolveDialogueConfig validates and normalizes dialogue options', () => {
  const result = resolveDialogueConfig(
    {
      dialogue: true,
      dialogueAgent1: 'seller',
      dialogueAgent2: 'buyer',
      maxTurns: '12',
      agreementToken: 'DEAL_DONE',
    },
    [
      { name: 'seller', prompt: 'Sell gold' },
      { name: 'buyer', prompt: 'Buy gold' },
    ],
  );

  assert.ok(result);
  assert.equal(result?.agent1Name, 'seller');
  assert.equal(result?.agent2Name, 'buyer');
  assert.equal(result?.maxTurns, 12);
  assert.equal(result?.stopOnAgreement, true);
  assert.equal(result?.agreementToken, 'DEAL_DONE');
});

test('resolveDialogueConfig throws for unknown agent names', () => {
  assert.throws(
    () =>
      resolveDialogueConfig(
        {
          dialogue: true,
          dialogueAgent1: 'seller',
          dialogueAgent2: 'buyer',
        },
        [{ name: 'seller', prompt: 'Sell gold' }],
      ),
    /Unknown dialogue agent name/,
  );
});
