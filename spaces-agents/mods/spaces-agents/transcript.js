import { home } from "herdr";

const projectsDir = () => `${home()}/.claude/projects`;

export const transcriptPath = (cwd, sessionId) => `${projectsDir()}/${String(cwd ?? "").replace(/[^A-Za-z0-9]/g, "-")}/${sessionId}.jsonl`;
