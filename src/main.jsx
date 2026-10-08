import React from 'react';
import { createRoot } from 'react-dom/client';
import WorkspaceShell from './WorkspaceShell.jsx';
import ThemeProvider from './ThemeProvider.jsx';
import SettingsProvider from './SettingsProvider.jsx';
import './styles.css';
import './panel.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider><SettingsProvider><WorkspaceShell /></SettingsProvider></ThemeProvider></React.StrictMode>);
