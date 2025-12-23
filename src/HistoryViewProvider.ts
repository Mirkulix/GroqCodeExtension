import * as vscode from 'vscode';
import { ChatHistoryManager, ChatSession } from './ChatHistoryManager';

export class HistoryTreeProvider implements vscode.TreeDataProvider<ChatSessionItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ChatSessionItem | undefined | null | void> = new vscode.EventEmitter<ChatSessionItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ChatSessionItem | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(private readonly historyManager: ChatHistoryManager) {
        this.historyManager.onDidHistoryChange(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ChatSessionItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ChatSessionItem): Thenable<ChatSessionItem[]> {
        if (element) {
            return Promise.resolve([]);
        }

        const sessions = this.historyManager.getSessions();
        return Promise.resolve(
            sessions.map(session => new ChatSessionItem(
                session.title || 'Untitled Chat',
                session.id,
                session.lastModified,
                vscode.TreeItemCollapsibleState.None
            ))
        );
    }
}

export class ChatSessionItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly sessionId: string,
        public readonly timestamp: number,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.tooltip = `Chat from ${new Date(timestamp).toLocaleString()}`;
        this.description = new Date(timestamp).toLocaleDateString();
        this.command = {
            command: 'groq.loadChat',
            title: 'Load Chat',
            arguments: [this.sessionId]
        };
        this.contextValue = 'chatSession';
        this.iconPath = new vscode.ThemeIcon('comment-discussion');
    }
}
