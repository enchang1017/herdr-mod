import type {ComponentType} from 'react';
import {AgentRadarScreen, PickerPlusScreen, SessionHistoryScreen, SpacesAgentsScreen} from './agents';
import {JiraScreen, K9sScreen} from './ops';
import {ChangeRadarScreen, OpenIdeScreen, OrbitScreen, TeamScreen} from './work';

export const SCREENS: Record<string, ComponentType> = {
  'spaces-agents': SpacesAgentsScreen,
  'agent-radar': AgentRadarScreen,
  'change-radar': ChangeRadarScreen,
  'session-history': SessionHistoryScreen,
  'picker-plus': PickerPlusScreen,
  team: TeamScreen,
  jira: JiraScreen,
  k9s: K9sScreen,
  orbit: OrbitScreen,
  'open-ide': OpenIdeScreen,
};
