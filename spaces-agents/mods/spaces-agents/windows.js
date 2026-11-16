import { appHome, exec, window } from "herdr";
export const isWindows = () => window().platform === "windows";

export async function windows(mode, payload) {
  const result = await exec("pwsh", windowsArgs(mode, payload));
  if (result.code !== 0) throw new Error((result.stderr || result.stdout).trim());
  return result;
}

export function windowsArgs(mode, payload) {
  return ["-NoProfile", "-File", `${appHome()}/mods/spaces-agents/windows.ps1`, "-Mode", mode, "-Payload", payload];
}
