'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const BRANCH = 'aterum-host-control';
class GitControl {
  constructor({ root, remote = 'origin' }) { this.root = root; this.remote = remote; }
  async git(args, cwd) {
    try { return (await exec('git', args, { cwd, timeout: 30000, maxBuffer: 1048576,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout.trim(); }
    catch (_) { throw new Error('GIT_CONTROL_FAILED: network, credentials or concurrent ownership change; services remain blocked'); }
  }
  async change(hostId, action) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aterum-git-control-'));
    try {
      const url = await this.git(['remote', 'get-url', this.remote], this.root);
      await this.git(['init', '--quiet', directory], this.root);
      await this.git(['remote', 'add', 'origin', url], directory);
      const exists = await this.git(['ls-remote', '--heads', 'origin', `refs/heads/${BRANCH}`], directory);
      let state = null;
      if (exists) {
        await this.git(['fetch', '--quiet', 'origin', `refs/heads/${BRANCH}`], directory);
        await this.git(['checkout', '--quiet', '-B', BRANCH, 'FETCH_HEAD'], directory);
        state = JSON.parse(fs.readFileSync(path.join(directory, 'control.json'), 'utf8'));
        if (state.schema !== 'aterum-git-control-v1' || !['ACTIVE','RELEASED'].includes(state.mode)
            || typeof state.hostId !== 'string') throw new Error('INVALID_GIT_CONTROL_STATE');
      } else await this.git(['checkout', '--quiet', '--orphan', BRANCH], directory);
      if (state?.mode === 'ACTIVE' && state.hostId !== hostId) throw new Error('OTHER_PC_ACTIVE: retire the active PC before starting this PC');
      if (action === 'claim' && !state) throw new Error('GIT_CONTROL_NOT_INITIALIZED: run migrate on the current active PC first');
      const next = { schema: 'aterum-git-control-v1', hostId, mode: action === 'claim' ? 'ACTIVE' : 'RELEASED',
        updatedAt: new Date().toISOString() };
      fs.writeFileSync(path.join(directory, 'control.json'), JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
      await this.git(['add', '--', 'control.json'], directory);
      await this.git(['-c','user.name=Aterum host control','-c','user.email=host-control@aterum.local',
        'commit','--quiet','-m',`Host ${action}`], directory);
      // Fast-forward push rejects two competing claims from the same previous state.
      // New-branch creation uses an explicit empty lease to reject concurrent creation.
      await this.git(['push','--quiet', ...(exists ? [] : [`--force-with-lease=refs/heads/${BRANCH}:`]),
        'origin', `HEAD:refs/heads/${BRANCH}`], directory);
      return next;
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
  claim(hostId) { return this.change(hostId, 'claim'); }
  release(hostId) { return this.change(hostId, 'release'); }
}
module.exports = { GitControl };
