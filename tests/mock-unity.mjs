import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import fs from 'fs-extra';
import { appendFileSync } from 'node:fs';

// Never start a real application in protocol tests.
childProcess.exec = () => { throw new Error('Shell execution is forbidden in tests'); };
childProcess.execFile = (file, args, options, callback) => {
  if (typeof options === 'function') { callback = options; options = {}; }
  assert.ok(!options.shell);
  assert.ok(file === 'open' || file === '/Applications/Unity/Hub/Editor/2026.1/Unity.app/Contents/MacOS/Unity');
  appendFileSync(process.env.UNITY_TEST_LOG, JSON.stringify({ file, args, options }) + '\n');
  callback(null, '', '');
};
syncBuiltinESMExports();

const readdir = fs.readdir.bind(fs);
const pathExists = fs.pathExists.bind(fs);
fs.readdir = async (directory, ...args) => directory === '/Applications/Unity/Hub/Editor'
  ? ['2026.1'] : readdir(directory, ...args);
fs.pathExists = async (file) => file === '/Applications/Unity/Hub/Editor/2026.1/Unity.app/Contents/MacOS/Unity'
  ? true : pathExists(file);
