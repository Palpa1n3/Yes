import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted fonts — bundled, never fetched at runtime.
import '@fontsource/orbitron/400.css';
import '@fontsource/orbitron/600.css';
import '@fontsource/rajdhani/400.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/jetbrains-mono/200.css';
import '@fontsource/jetbrains-mono/300.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/index.css';

import { App } from './App';
import { DesktopWidget } from './components/hud/DesktopWidget';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing');

// The same bundle also draws the desktop widget (its own small window, #widget).
const widget = location.hash === '#widget';
createRoot(root).render(<StrictMode>{widget ? <DesktopWidget /> : <App />}</StrictMode>);
