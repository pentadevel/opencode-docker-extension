import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenCode wrapper extension is now active');

    // Register command to run nu script
    let runCmd = vscode.commands.registerCommand('nullshell.runScript', async () => {
        runNuScript();
    });

    context.subscriptions.push(runCmd);
}

async function runNuScript() {
    try {
        console.log('runNuScript called');
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        console.log('Workspace path:', workspacePath);

        // Find all .nu files in workspace
        console.log('Searching for .nu files...');
        const nuFiles = await vscode.workspace.findFiles('**/*.nu', '**/node_modules/**');
        console.log('Found .nu files:', nuFiles.length);

        let scriptPath: string;

        if (nuFiles.length === 0) {
            // No .nu files found, let user browse
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    'NuShell Scripts': ['nu']
                },
                title: 'Select a NuShell script to run'
            });

            if (!result || result.length === 0) {
                vscode.window.showInformationMessage('No script selected');
                return;
            }

            scriptPath = result[0].fsPath;
        } else if (nuFiles.length === 1) {
            // Only one .nu file, use it directly
            scriptPath = nuFiles[0].fsPath;
        } else {
            // Multiple .nu files, let user pick
            const items = nuFiles.map(file => ({
                label: path.basename(file.fsPath),
                description: vscode.workspace.asRelativePath(file),
                filePath: file.fsPath
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a NuShell script to run'
            });

            if (!selected) {
                vscode.window.showInformationMessage('No script selected');
                return;
            }

            scriptPath = selected.filePath;
        }

        // Use script's directory as working directory
        const scriptDir = path.dirname(scriptPath);

        // Find nu executable in common locations
        const nuPaths = [
            '/opt/homebrew/bin/nu',  // Homebrew on Apple Silicon
            '/usr/local/bin/nu',     // Homebrew on Intel Mac
            '/usr/bin/nu',           // System binaries
        ];

        let nuExecutable = 'nu';  // fallback to PATH resolution

        // Check which path exists and use it
        for (const nuPath of nuPaths) {
            try {
                if (fs.existsSync(nuPath)) {
                    nuExecutable = nuPath;
                    console.log('Found nu at:', nuPath);
                    break;
                }
            } catch (e) {
                // Continue checking other paths
            }
        }

        // Create or reuse terminal
        const terminalName = `NuShell: ${path.basename(scriptPath)}`;

        // Find existing terminal with this name or create new one
        let terminal = vscode.window.terminals.find(t => t.name === terminalName);

        if (!terminal) {
            // Create a new terminal with custom shell
            terminal = vscode.window.createTerminal({
                name: terminalName,
                cwd: scriptDir,
                env: {
                    ...process.env,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:${process.env.PATH || ''}`
                }
            });
        }

        // Show the terminal
        terminal.show(true); // preserveFocus = true to keep editor focused

        // Send the command to run the script
        terminal.sendText(`${nuExecutable} "${scriptPath}"`);

    } catch (error) {
        console.error('Error in runNuScript:', error);
        vscode.window.showErrorMessage(`Failed to run NuShell script: ${error}`);
    }
}

export function deactivate() {
    // Cleanup handled by VSCode
}
