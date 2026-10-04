import React from 'react';
import { createRoot } from 'react-dom/client';
import WorkspaceShell from './WorkspaceShell.jsx';
import ThemeProvider from './ThemeProvider.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider><WorkspaceShell /></ThemeProvider></React.StrictMode>);
