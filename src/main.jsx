import WebSyncStatus from './WebSyncStatus.jsx';
import React from 'react';
import { createRoot } from 'react-dom/client';
import WorkspaceShell from './WorkspaceShell.jsx';
import ThemeProvider from './ThemeProvider.jsx';
import SettingsProvider from './SettingsProvider.jsx';
import WebTransferStatus from './WebTransferStatus.jsx';
import WebRecordingRecovery from './WebRecordingRecovery.jsx';
import './styles.css';
import './improvements-2.5.css';
import './panel.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider><SettingsProvider><WorkspaceShell /><WebTransferStatus/>{window.desktop.remote?<WebSyncStatus/>:null}<WebRecordingRecovery/></SettingsProvider></ThemeProvider></React.StrictMode>);

import './v2.css';
