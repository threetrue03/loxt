import WorkspaceBoundary from './WorkspaceBoundary.jsx';
import { useCallback, useState } from 'react';
import App from './App.jsx';
import LiveWorkspace from './LiveWorkspace.jsx';

export default function WorkspaceShell() {
  const [workspace, setWorkspace] = useState(() => {
    try { return localStorage.getItem('loxt.workspace') === 'live' ? 'live' : 'work'; }
    catch { return 'work'; }
  });
  const [visitedLive, setVisitedLive] = useState(workspace === 'live');
  const [workActive, setWorkActive] = useState(false);
  const [liveActive, setLiveActive] = useState(false);
  const [liveReturn, setLiveReturn] = useState(0);
  const changeWorkspace = useCallback((value, destination) => {
    if (!['work', 'live'].includes(value)) return;
    if (value === 'live') setVisitedLive(true);
    if (value === 'live' && destination === 'recording') setLiveReturn(value => value + 1);
    setWorkspace(value);
    try { localStorage.setItem('loxt.workspace', value); } catch {}
    requestAnimationFrame(() => document.querySelector('.workspace-panel:not([hidden]) .workspace-menu .menu-trigger')?.focus());
  }, []);
  // Keep Work mounted: its recorder and conversion subscriptions must survive switching.
  return <><div className="workspace-panel" data-workspace="work" hidden={workspace !== 'work'}><WorkspaceBoundary><App liveActive={liveActive} workspaceActive={workspace === 'work'} onWorkspaceChange={changeWorkspace} onBackgroundChange={setWorkActive}/></WorkspaceBoundary></div>{visitedLive ? <div className="workspace-panel" data-workspace="live" hidden={workspace !== 'live'}><WorkspaceBoundary><LiveWorkspace returnToRecording={liveReturn} onBackgroundChange={setLiveActive} active={workspace === 'live'} workActive={workActive} onWorkspaceChange={changeWorkspace}/></WorkspaceBoundary></div> : null}</>;
}
