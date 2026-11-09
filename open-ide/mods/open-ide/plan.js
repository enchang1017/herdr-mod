export const OPEN = "open";
export const RIDER_APP = "Rider";
export const CODE = "code";

const DOTNET = /\.(sln|slnx|csproj)$/i;
const SOLUTION = /\.(sln|slnx)$/i;

export const baseName = (path) => String(path).replace(/\/+$/, "").split("/").pop() || String(path);

export function dotnetFiles(listing) {
  return String(listing ?? "").split("\n").map((line) => line.trim()).filter((line) => DOTNET.test(line)).sort();
}

function pickSolution(dir, files) {
  const solutions = files.filter((one) => SOLUTION.test(one));
  if (!solutions.length) return null;
  const name = baseName(dir).toLowerCase();
  return solutions.find((one) => baseName(one).toLowerCase().startsWith(name)) ?? solutions[0];
}

export function localPlan(folder, found) {
  if (found && found.files.length) {
    const solution = pickSolution(found.dir, found.files);
    const path = solution ?? found.dir;
    return Object.freeze({ ide: "Rider", command: OPEN, args: ["-na", RIDER_APP, "--args", path], path });
  }
  return Object.freeze({ ide: "VS Code", command: CODE, args: [folder], path: folder });
}

export function remotePlan(folder, machine, target) {
  if (!target) throw new Error(`No ssh target is known for machine ${machine}`);
  return Object.freeze({ ide: `VS Code (Remote-SSH ${target})`, command: CODE, args: ["--remote", `ssh-remote+${target}`, folder], path: folder, remote: true });
}
