import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';

export interface ToolCall {
    tool: string;
    params: any;
    id: string;
}

export class ToolEngine {
    constructor() {}

    public async executeTool(toolCall: ToolCall): Promise<string> {
        try {
            switch (toolCall.tool) {
                case 'create_file':
                    return await this.createFile(toolCall.params.path, toolCall.params.content);
                case 'edit_file':
                    // Simple overwrite for now, can be enhanced to search/replace
                    return await this.createFile(toolCall.params.path, toolCall.params.content); 
                case 'read_file':
                    return await this.readFile(toolCall.params.path);
                case 'list_files':
                    return await this.listFiles(toolCall.params.path);
                case 'run_command':
                    return await this.runCommand(toolCall.params.command);
                default:
                    return `Error: Unknown tool '${toolCall.tool}'`;
            }
        } catch (error: any) {
            return `Error executing ${toolCall.tool}: ${error.message}`;
        }
    }

    private getWorkspacePath(relativePath: string): string {
        if (!vscode.workspace.workspaceFolders) {
            throw new Error('No workspace open');
        }
        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
        return path.join(root, relativePath);
    }

    private async createFile(filePath: string, content: string): Promise<string> {
        const fullPath = this.getWorkspacePath(filePath);
        const dir = path.dirname(fullPath);
        
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        await fs.promises.writeFile(fullPath, content, 'utf-8');
        return `Successfully created/updated file: ${filePath}`;
    }

    private async readFile(filePath: string): Promise<string> {
        const fullPath = this.getWorkspacePath(filePath);
        if (!fs.existsSync(fullPath)) {
            return `File not found: ${filePath}`;
        }
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        return content;
    }

    private async listFiles(dirPath: string = '.'): Promise<string> {
        const fullPath = this.getWorkspacePath(dirPath);
        if (!fs.existsSync(fullPath)) {
            return `Directory not found: ${dirPath}`;
        }
        
        const files = await fs.promises.readdir(fullPath);
        return `Files in ${dirPath}:\n${files.join('\n')}`;
    }

    private async runCommand(command: string): Promise<string> {
        if (!vscode.workspace.workspaceFolders) {
            throw new Error('No workspace open');
        }
        const root = vscode.workspace.workspaceFolders[0].uri.fsPath;

        return new Promise((resolve) => {
            cp.exec(command, { cwd: root }, (error, stdout, stderr) => {
                if (error) {
                    resolve(`Command failed: ${error.message}\nStderr: ${stderr}`);
                } else {
                    resolve(`Output:\n${stdout}\n${stderr ? `Stderr: ${stderr}` : ''}`);
                }
            });
        });
    }
}
