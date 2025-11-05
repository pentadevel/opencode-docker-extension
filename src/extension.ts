import * as vscode from 'vscode';
import * as path from 'path';
import * as pty from 'node-pty';
import * as fs from 'fs';
import { execSync } from 'child_process';

let terminalPanel: vscode.WebviewPanel | undefined;
let ptyProcess: pty.IPty | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('OpenCode wrapper extension is now active');

    // Register command to run nu script
    let runCmd = vscode.commands.registerCommand('nullshell.runScript', async () => {
        runNuScript(context);
    });

    context.subscriptions.push(runCmd);
}

function findNuBinary(): string | null {
    // Common locations for nu binary on macOS (Apple Silicon and Intel)
    const commonPaths = [
        '/opt/homebrew/bin/nu',  // Homebrew on Apple Silicon
        '/usr/local/bin/nu',      // Homebrew on Intel
        '/usr/bin/nu',            // System-wide install
    ];

    // Check common paths first
    for (const nuPath of commonPaths) {
        try {
            if (fs.existsSync(nuPath)) {
                return nuPath;
            }
        } catch (e) {
            // Continue to next path
        }
    }

    // Try to find nu using 'which' command
    try {
        const result = execSync('which nu', { encoding: 'utf8' }).trim();
        if (result) {
            return result;
        }
    } catch (e) {
        // which command failed
    }

    // Try PATH environment variable
    if (process.env.PATH) {
        const pathDirs = process.env.PATH.split(':');
        for (const dir of pathDirs) {
            const nuPath = path.join(dir, 'nu');
            try {
                if (fs.existsSync(nuPath)) {
                    return nuPath;
                }
            } catch (e) {
                // Continue to next directory
            }
        }
    }

    return null;
}

async function runNuScript(context: vscode.ExtensionContext) {
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

    // Create or show terminal panel
    if (terminalPanel) {
        terminalPanel.reveal(vscode.ViewColumn.Beside);
        // Update title with script name
        terminalPanel.title = `NuShell: ${path.basename(scriptPath)}`;
    } else {
        terminalPanel = vscode.window.createWebviewPanel(
            'nuTerminal',
            `NuShell: ${path.basename(scriptPath)}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        terminalPanel.webview.html = getTerminalHTML();

        terminalPanel.onDidDispose(() => {
            if (ptyProcess) {
                ptyProcess.kill();
            }
            terminalPanel = undefined;
            ptyProcess = undefined;
        });

        // Handle messages from webview (user input and resize)
        terminalPanel.webview.onDidReceiveMessage(
            message => {
                if (message.type === 'input' && ptyProcess) {
                    // Send user input to the PTY
                    ptyProcess.write(message.text);
                } else if (message.type === 'resize' && ptyProcess) {
                    // Resize the PTY
                    ptyProcess.resize(message.cols, message.rows);
                }
            },
            undefined,
            context.subscriptions
        );
    }

    // Start nu process
    if (ptyProcess) {
        ptyProcess.kill();
    }

    // Use script's directory as working directory
    const scriptDir = path.dirname(scriptPath);

    // Try to find nu binary in common locations
    const nuPath = findNuBinary();
    if (!nuPath) {
        vscode.window.showErrorMessage(
            'NuShell (nu) not found. Please install it from https://www.nushell.sh/ or ensure it is in your PATH'
        );
        return;
    }

    // Resolve symlinks to get the actual binary path (important for macOS Homebrew)
    let resolvedNuPath = nuPath;
    try {
        resolvedNuPath = fs.realpathSync(nuPath);
        console.log('Resolved nu path:', resolvedNuPath);
    } catch (e) {
        console.warn('Could not resolve symlink for nu binary:', e);
        // Continue with original path
    }

    // Create PTY process (real terminal)
    ptyProcess = pty.spawn(resolvedNuPath, [scriptPath], {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: scriptDir,
        env: process.env as { [key: string]: string }
    });

    // Clear previous output and send initial info
    terminalPanel.webview.postMessage({
        type: 'clear'
    });

    terminalPanel.webview.postMessage({
        type: 'output',
        text: `Running: ${scriptPath}\r\nWorking Directory: ${scriptDir}\r\n\r\n`
    });

    // Capture all output from PTY
    ptyProcess.onData((data: string) => {
        terminalPanel?.webview.postMessage({
            type: 'output',
            text: data
        });
    });

    // Handle process exit
    ptyProcess.onExit((event: { exitCode: number; signal?: number }) => {
        terminalPanel?.webview.postMessage({
            type: 'output',
            text: `\r\n\r\nProcess exited with code: ${event.exitCode}\r\n`
        });
        ptyProcess = undefined;
    });
    } catch (error) {
        console.error('Error in runNuScript:', error);
        vscode.window.showErrorMessage(`Failed to run NuShell script: ${error}`);
    }
}

function getTerminalHTML(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NuShell Interactive Terminal</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.css" />
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            background-color: var(--vscode-terminal-background);
            height: 100vh;
            overflow: hidden;
        }

        #terminal {
            width: 100%;
            height: 100%;
            padding: 10px;
        }
    </style>
</head>
<body>
    <div id="terminal"></div>

    <script src="https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.js"></script>
    <script>
        const vscode = acquireVsCodeApi();

        // Create xterm instance
        const term = new Terminal({
            cursorBlink: true,
            fontSize: 13,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            theme: {
                background: getComputedStyle(document.body).getPropertyValue('--vscode-terminal-background') || '#1e1e1e',
                foreground: getComputedStyle(document.body).getPropertyValue('--vscode-terminal-foreground') || '#cccccc'
            },
            scrollback: 10000
        });

        // Add fit addon
        const fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);

        // Open terminal in the container
        term.open(document.getElementById('terminal'));
        fitAddon.fit();

        // Handle window resize
        window.addEventListener('resize', () => {
            fitAddon.fit();
            // Notify extension about terminal size change
            vscode.postMessage({
                type: 'resize',
                cols: term.cols,
                rows: term.rows
            });
        });

        // Send initial terminal size
        setTimeout(() => {
            vscode.postMessage({
                type: 'resize',
                cols: term.cols,
                rows: term.rows
            });
        }, 100);

        // Handle user input from terminal
        term.onData(data => {
            vscode.postMessage({
                type: 'input',
                text: data
            });
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.type === 'output') {
                term.write(message.text);
            } else if (message.type === 'clear') {
                term.clear();
            }
        });

        // Focus terminal
        term.focus();
    </script>
</body>
</html>`;
}

export function deactivate() {
    if (ptyProcess) {
        ptyProcess.kill();
    }
    if (terminalPanel) {
        terminalPanel.dispose();
    }
}
