import * as vscode from 'vscode';

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

export interface ChatSession {
    id: string;
    title: string;
    lastModified: number;
    messages: ChatMessage[];
    model: string;
}

export class ChatHistoryManager {
    private static readonly STORAGE_KEY = 'groq.chatHistory';
    private _onDidHistoryChange = new vscode.EventEmitter<void>();
    public readonly onDidHistoryChange = this._onDidHistoryChange.event;

    constructor(private readonly context: vscode.ExtensionContext) {}

    public getSessions(): ChatSession[] {
        return this.context.globalState.get<ChatSession[]>(ChatHistoryManager.STORAGE_KEY, [])
            .sort((a, b) => b.lastModified - a.lastModified);
    }

    public async saveSession(session: ChatSession): Promise<void> {
        const sessions = this.getSessions();
        const index = sessions.findIndex(s => s.id === session.id);
        
        if (index !== -1) {
            sessions[index] = session;
        } else {
            sessions.push(session);
        }

        // Limit history to 50 sessions to prevent bloating globalState
        if (sessions.length > 50) {
            sessions.sort((a, b) => b.lastModified - a.lastModified);
            sessions.length = 50;
        }

        await this.context.globalState.update(ChatHistoryManager.STORAGE_KEY, sessions);
        this._onDidHistoryChange.fire();
    }

    public async deleteSession(id: string): Promise<void> {
        let sessions = this.getSessions();
        sessions = sessions.filter(s => s.id !== id);
        await this.context.globalState.update(ChatHistoryManager.STORAGE_KEY, sessions);
        this._onDidHistoryChange.fire();
    }

    public getSession(id: string): ChatSession | undefined {
        return this.getSessions().find(s => s.id === id);
    }

    public async clearHistory(): Promise<void> {
        await this.context.globalState.update(ChatHistoryManager.STORAGE_KEY, []);
        this._onDidHistoryChange.fire();
    }

    public createSession(title: string = 'New Chat', model: string = 'llama3-70b-8192'): ChatSession {
        return {
            id: Date.now().toString(),
            title,
            lastModified: Date.now(),
            messages: [],
            model
        };
    }
}
