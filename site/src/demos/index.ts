import type {ComponentType} from 'react';
import {AgentRadarDemo} from './AgentRadarDemo';
import {ChangeRadarDemo} from './ChangeRadarDemo';
import {JiraDemo} from './JiraDemo';
import {K9sDemo} from './K9sDemo';
import {OpenIdeDemo} from './OpenIdeDemo';
import {OrbitDemo} from './OrbitDemo';
import {PickerPlusDemo} from './PickerPlusDemo';
import {SessionHistoryDemo} from './SessionHistoryDemo';
import {SpacesAgentsDemo} from './SpacesAgentsDemo';
import {TeamDemo} from './TeamDemo';

export const DEMOS: Record<string, ComponentType> = {
  'spaces-agents': SpacesAgentsDemo,
  'agent-radar': AgentRadarDemo,
  'change-radar': ChangeRadarDemo,
  'session-history': SessionHistoryDemo,
  'picker-plus': PickerPlusDemo,
  team: TeamDemo,
  jira: JiraDemo,
  k9s: K9sDemo,
  orbit: OrbitDemo,
  'open-ide': OpenIdeDemo,
};
