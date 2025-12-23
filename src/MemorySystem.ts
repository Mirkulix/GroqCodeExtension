import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface FileIndex {
    path: string;
    content: string;
    keywords: string[];
    lastModified: number;
}

export class MemorySystem {
    private index: FileIndex[] = [];
    private isIndexing: boolean = false;
    private workspaceRoot: string | undefined;
    private totalTokens: number = 0;

    constructor() {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            this.workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            // Initial scan (non-blocking)
            this.scanWorkspace();
        }
    }

    public async scanWorkspace() {
        if (this.isIndexing || !this.workspaceRoot) return;
        this.isIndexing = true;
        this.totalTokens = 0;
        console.log('MemorySystem: Starting workspace scan...');
        vscode.window.setStatusBarMessage('$(sync~spin) Groq Memory: Indexing...', 5000);

        try {
            // Find relevant code files using VS Code API (respects .gitignore)
            // Removed limit of 500 to support larger workspaces (up to millions of tokens)
            const includePattern = '**/*.{ts,js,py,java,c,cpp,h,cs,php,html,css,json,md,sql,rs,go,rb,kt,swift,scala,sh,yaml,xml}';
            const excludePattern = '**/node_modules/**';
            
            // Allow unlimited files (undefined maxResults)
            const uris = await vscode.workspace.findFiles(includePattern, excludePattern);

            this.index = []; // Reset index
            
            // Process in chunks to avoid blocking the event loop
            const CHUNK_SIZE = 50;
            for (let i = 0; i < uris.length; i += CHUNK_SIZE) {
                const chunk = uris.slice(i, i + CHUNK_SIZE);
                
                await Promise.all(chunk.map(async (uri) => {
                    try {
                        const fullPath = uri.fsPath;
                        const stats = await fs.promises.stat(fullPath);
                        
                        // Increase limit to 500KB to support larger files
                        if (stats.size > 500 * 1024) return;

                        const content = await fs.promises.readFile(fullPath, 'utf-8');
                        const tokens = Math.ceil(content.length / 4); // Approx token count

                        // Safety cap: stop indexing if we exceed ~50MB of text (approx 12M tokens)
                        // to prevent Extension Host OOM.
                        if (this.totalTokens > 12000000) return; 

                        // Simple keyword extraction
                        const keywords = content
                            .split(/[^a-zA-Z0-9_]/)
                            .filter(w => w.length > 3)
                            .map(w => w.toLowerCase());
                        
                        const uniqueKeywords = Array.from(new Set(keywords));

                        this.index.push({
                            path: vscode.workspace.asRelativePath(uri),
                            content: content,
                            keywords: uniqueKeywords,
                            lastModified: stats.mtimeMs
                        });
                        this.totalTokens += tokens;

                    } catch (e) {
                        console.error(`Failed to index file ${uri.fsPath}:`, e);
                    }
                }));

                // Yield to event loop
                await new Promise(resolve => setTimeout(resolve, 5));
                
                // Report progress every 500 files
                if (i % 500 === 0 && i > 0) {
                     vscode.window.setStatusBarMessage(`Groq Memory: Indexed ${i}/${uris.length} files...`, 2000);
                }
            }
            
            console.log(`MemorySystem: Indexed ${this.index.length} files. Total approx tokens: ${this.totalTokens}`);
            vscode.window.setStatusBarMessage(`Groq Memory: Ready (${(this.totalTokens / 1000).toFixed(1)}k tokens)`, 5000);

        } catch (error) {
            console.error('MemorySystem: Scan failed', error);
        } finally {
            this.isIndexing = false;
        }
    }

    public getStatus(): string {
        return `Indexed Documents: ${this.index.length}\nApprox. Tokens: ${this.totalTokens.toLocaleString()}`;
    }

    public retrieveContext(query: string, limit: number = 3): string {
        if (this.index.length === 0) return "";

        const queryKeywords = query.toLowerCase().split(/[^a-zA-Z0-9_]/).filter(w => w.length > 3);
        if (queryKeywords.length === 0) return "";

        // Simple scoring: Count how many query keywords appear in the file
        const scoredFiles = this.index.map(file => {
            let score = 0;
            // Keyword overlap
            for (const qk of queryKeywords) {
                if (file.keywords.includes(qk)) score += 1;
                // Bonus for filename match
                if (file.path.toLowerCase().includes(qk)) score += 5;
            }
            return { file, score };
        });

        // Filter zero scores and sort
        const relevant = scoredFiles
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        if (relevant.length === 0) return "";

        // Format context
        let contextString = "\n\nRelevant Workspace Files (Auto-Retrieved):\n";
        for (const item of relevant) {
            contextString += `\nFile: ${item.file.path} (Relevance: ${item.score})\n\`\`\`\n${item.file.content}\n\`\`\`\n`;
        }

        return contextString;
    }
}
