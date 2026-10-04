const path = require('node:path');
const { Library } = require('./library.cjs');

class WorkspaceLibraries {
  constructor(userData) {
    // Existing Work recordings, indexes and paths are not migrated or copied.
    this.work = new Library(path.join(userData, 'library'));
    this.live = new Library(path.join(userData, 'live-library'));
    for (const library of [this.work, this.live]) library.ready.catch(() => {});
  }
  get(workspace) {
    if (workspace !== 'work' && workspace !== 'live') throw new Error('올바른 워크스페이스를 선택해 주세요.');
    return this[workspace];
  }
}

module.exports = { WorkspaceLibraries };
