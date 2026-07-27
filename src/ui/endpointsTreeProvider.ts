import * as vscode from "vscode";
import type { ApiEndpoint } from "../core/types";
import { EndpointRegistry } from "../core/endpointRegistry";

type TreeNode = GroupNode | EndpointNode;

export class EndpointsTreeProvider implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly registry: EndpointRegistry) {
    this.subscription = registry.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): TreeNode[] {
    if (element instanceof EndpointNode) return [];
    if (element instanceof GroupNode)
      return element.endpoints.map((endpoint) => new EndpointNode(endpoint, this.registry));
    const groups = new Map<string, ApiEndpoint[]>();
    for (const endpoint of this.registry.all()) {
      const tag = endpoint.tags[0] ?? "Default";
      groups.set(tag, [...(groups.get(tag) ?? []), endpoint]);
    }
    if (!groups.size) return [new GroupNode("No scan results — run “Scan Project”", [])];
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tag, endpoints]) => new GroupNode(tag, endpoints));
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }
}

class GroupNode extends vscode.TreeItem {
  constructor(
    readonly label: string,
    readonly endpoints: ApiEndpoint[]
  ) {
    super(
      label,
      endpoints.length
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None
    );
    this.description = endpoints.length ? `${endpoints.length}` : undefined;
    this.iconPath = new vscode.ThemeIcon("folder-library");
  }
}

export class EndpointNode extends vscode.TreeItem {
  constructor(readonly endpoint: ApiEndpoint, registry: EndpointRegistry) {
    super(
      `${endpoint.method.toUpperCase()} ${endpoint.fullPath}`,
      vscode.TreeItemCollapsibleState.None
    );
    this.contextValue = "happyDocs.endpoint";

    const isVerified = registry.getVerification(endpoint.id)?.reachable;
    this.description = isVerified
      ? `✓ Verified`
      : endpoint.confidence === "high"
        ? undefined
        : `${endpoint.confidence} confidence`;
    this.tooltip = `${endpoint.framework} • ${endpoint.source.filePath}:${endpoint.source.line}`;
    this.iconPath = new vscode.ThemeIcon(iconFor(endpoint.method));
    this.command = {
      command: "vscode.open",
      title: "Open endpoint source",
      arguments: [
        vscode.Uri.file(endpoint.source.filePath),
        {
          selection: new vscode.Range(
            endpoint.source.line - 1,
            endpoint.source.column - 1,
            endpoint.source.line - 1,
            endpoint.source.column
          )
        }
      ]
    };
  }
}

function iconFor(method: ApiEndpoint["method"]): string {
  if (method === "get") return "arrow-down";
  if (method === "post") return "add";
  if (method === "delete") return "trash";
  return "edit";
}
