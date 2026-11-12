#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const value = spawnSync(process.argv[2], process.argv.slice(3), { env: process.env, encoding: 'utf8', timeout: 30000 });
const passed = value.status === 0 && value.stdout.includes('accepted');
console.log(JSON.stringify({ expectedExit: 0, exit: value.status, stdout: value.stdout, stderr: value.stderr, passed }));
process.exitCode = passed ? 0 : 1;
