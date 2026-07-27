import * as path from "node:path";
import * as vscode from "vscode";

export async function writeWorkspaceFile(
  root: vscode.Uri,
  relativePath: string,
  content: string
): Promise<vscode.Uri> {
  const target = vscode.Uri.joinPath(root, ...relativePath.split(/[\\/]/));
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(target.fsPath)));
  await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));
  return target;
}

export function sourceGlobQuery(
  include: string[],
  exclude: string[]
): { include: string; exclude: string } {
  const wrap = (items: string[]) => (items.length === 1 ? items[0] : `{${items.join(",")}}`);
  return { include: wrap(include), exclude: wrap(exclude) };
}
