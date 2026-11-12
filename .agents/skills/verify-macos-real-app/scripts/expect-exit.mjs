#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const expectedExit = Number(process.argv[2]);
const value = spawnSync(process.argv[3], process.argv.slice(4), { env: process.env, encoding: 'utf8', timeout: 30000 });
const passed = value.status === expectedExit;
console.log(JSON.stringify({ expectedExit, exit: value.status, stdout: value.stdout, stderr: value.stderr, passed }));
process.exitCode = passed ? 0 : 1;
