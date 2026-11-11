import {StrictMode} from 'react';
import {createRoot, hydrateRoot} from 'react-dom/client';
import './styles';
import App from './App';
import {DemoOnly} from './DemoOnly';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Missing #root element');
}

const demo = new URLSearchParams(window.location.search).get('demo');

const app = (
  <StrictMode>
    {demo ? <DemoOnly name={demo} /> : <App />}
  </StrictMode>
);

if (root.hasChildNodes() && !demo) {
  hydrateRoot(root, app);
} else {
  root.replaceChildren();
  createRoot(root).render(app);
}
