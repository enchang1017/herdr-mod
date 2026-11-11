import type {ReactElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GeneralArrangement} from './drawings/GeneralArrangement';
import {AgentRadarDrawing, ChangeRadarDrawing, JiraDrawing, K9sDrawing} from './drawings/details';
import {SidebarDrawing} from './drawings/SidebarDrawing';

const DRAWINGS: Record<string, ReactElement> = {
  'general-arrangement': <GeneralArrangement />,
  'agent-radar': <AgentRadarDrawing active={null} />,
  'change-radar': <ChangeRadarDrawing active={null} />,
  jira: <JiraDrawing active={null} />,
  k9s: <K9sDrawing active={null} />,
  'spaces-agents': <SidebarDrawing />,
};

export function renderDiagrams(): Record<string, string> {
  return Object.fromEntries(Object.entries(DRAWINGS).map(([name, el]) => [name, renderToStaticMarkup(el)]));
}
