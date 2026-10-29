import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('all six Unity tools operate on fixtures with application launches intercepted', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'unity-protocol-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'A "quoted" project');
  await mkdir(path.join(project, 'ProjectSettings'), { recursive: true });
  await writeFile(path.join(project, 'ProjectSettings', 'ProjectSettings.asset'), 'fixture');
  const log = path.join(root, 'commands.jsonl');
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import', './tests/mock-unity.mjs', 'index.js'],
    env: { PATH: process.env.PATH, UNITY_TEST_LOG: log },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'operations-test', version: '1.0.0' });
  t.after(() => client.close());
  await client.connect(transport);
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result));
    return JSON.parse(result.content[0].text);
  };
  const projects = await call('unity_list_projects', { directory: root });
  assert.equal(projects.count, 1);
  assert.equal(projects.projects[0].path, project);
  assert.equal((await call('unity_list_installed_versions', {})).versions[0].version, '2026.1');
  await call('unity_create_project', { projectName: 'New "project"', projectPath: root, template: '3D', unityVersion: '2026.1' });
  await call('unity_open_project', { projectPath: project });
  const output = path.join(root, 'Build "output"');
  await call('unity_build_project', { projectPath: project, outputPath: output });
  const commands = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(commands.map(c => c.args), [
    ['-createProject', path.join(root, 'New "project"'), '-template', '3D', '-quit', '-batchmode'],
    ['-a', 'Unity Hub', '--args', '-projectPath', project],
    ['-batchmode', '-quit', '-projectPath', project, '-buildTarget', 'StandaloneOSX', '-buildPath', output],
  ]);
  assert.equal(commands[2].options.maxBuffer, 10 * 1024 * 1024);
  await call('unity_create_script', { projectPath: project, scriptName: 'Example' });
  assert.match(await readFile(path.join(project, 'Assets/Scripts/Example.cs'), 'utf8'), /class Example : MonoBehaviour/);
  assert.match(await readFile(path.join(project, 'Assets/Scripts/Example.cs.meta'), 'utf8'), /guid: [a-f0-9]{32}/);
  await call('unity_create_script', { projectPath: project, scriptName: 'Custom', template: 'Custom', content: '// fixture' });
  assert.equal(await readFile(path.join(project, 'Assets/Scripts/Custom.cs'), 'utf8'), '// fixture');
  await assert.rejects(client.callTool({ name: 'unity_open_project', arguments: { projectPath: path.join(root, 'missing') } }), /Not a valid Unity project/);
  assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 3);
});
