#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

// Unity Hub und Editor Pfade (macOS)
const UNITY_HUB_PATH = '/Applications/Unity Hub.app/Contents/MacOS/Unity Hub';
const UNITY_EDITORS_BASE = '/Applications/Unity/Hub/Editor';

class UnityMCPServer {
  constructor() {
    this.server = new Server({
      name: 'unity-mcp-server',
      version: '1.0.0',
      description: 'MCP server for Unity integration'
    }, {
      capabilities: {
        tools: {},
        resources: {}
      }
    });
    
    this.setupTools();
    this.setupErrorHandling();
  }

  setupTools() {
    // Liste der Unity-Tools
    const tools = [
      {
        name: 'unity_list_projects',
        description: 'List all Unity projects in a directory',
        inputSchema: {
          type: 'object',
          properties: {
            directory: {
              type: 'string',
              description: 'Directory to search for Unity projects (default: home directory)'
            }
          }
        }
      },
      {
        name: 'unity_create_project',
        description: 'Create a new Unity project',
        inputSchema: {
          type: 'object',
          properties: {
            projectName: {
              type: 'string',
              description: 'Name of the new project'
            },
            projectPath: {
              type: 'string',
              description: 'Path where to create the project'
            },
            template: {
              type: 'string',
              description: 'Project template (e.g., "3D", "2D", "URP", "HDRP")',
              default: '3D'
            },
            unityVersion: {
              type: 'string',
              description: 'Unity version to use (optional)'
            }
          },
          required: ['projectName', 'projectPath']
        }
      },
      {
        name: 'unity_open_project',
        description: 'Open a Unity project',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to the Unity project'
            }
          },
          required: ['projectPath']
        }
      },
      {
        name: 'unity_list_installed_versions',
        description: 'List all installed Unity versions',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'unity_create_script',
        description: 'Create a new C# script in a Unity project',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to the Unity project'
            },
            scriptName: {
              type: 'string',
              description: 'Name of the script (without .cs extension)'
            },
            scriptPath: {
              type: 'string',
              description: 'Relative path within Assets folder (e.g., "Scripts")',
              default: 'Scripts'
            },
            template: {
              type: 'string',
              description: 'Script template type (MonoBehaviour, ScriptableObject, Custom)',
              default: 'MonoBehaviour'
            },
            content: {
              type: 'string',
              description: 'Custom script content (for Custom template)'
            }
          },
          required: ['projectPath', 'scriptName']
        }
      },
      {
        name: 'unity_build_project',
        description: 'Build a Unity project',
        inputSchema: {
          type: 'object',
          properties: {
            projectPath: {
              type: 'string',
              description: 'Path to the Unity project'
            },
            buildTarget: {
              type: 'string',
              description: 'Build target (StandaloneOSX, StandaloneWindows64, iOS, Android, WebGL)',
              default: 'StandaloneOSX'
            },
            outputPath: {
              type: 'string',
              description: 'Output path for the build'
            }
          },
          required: ['projectPath', 'outputPath']
        }
      }
    ];

    // Registriere alle Tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools };
    });

    // Handler für Tool-Aufrufe
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      switch (name) {
        case 'unity_list_projects':
          return await this.listProjects(args);
        case 'unity_create_project':
          return await this.createProject(args);
        case 'unity_open_project':
          return await this.openProject(args);
        case 'unity_list_installed_versions':
          return await this.listInstalledVersions();
        case 'unity_create_script':
          return await this.createScript(args);
        case 'unity_build_project':
          return await this.buildProject(args);
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  async listProjects(args) {
    const searchDir = args.directory || os.homedir();
    const projects = [];
    
    async function searchForProjects(dir, depth = 0) {
      if (depth > 3) return; // Max depth to avoid deep recursion
      
      try {
        const items = await fs.readdir(dir);
        
        for (const item of items) {
          const fullPath = path.join(dir, item);
          const stats = await fs.stat(fullPath);
          
          if (stats.isDirectory()) {
            // Check if it's a Unity project
            const projectSettingsPath = path.join(fullPath, 'ProjectSettings', 'ProjectSettings.asset');
            if (await fs.pathExists(projectSettingsPath)) {
              projects.push({
                name: item,
                path: fullPath,
                lastModified: stats.mtime
              });
            } else if (!item.startsWith('.') && item !== 'node_modules') {
              // Recurse into subdirectories
              await searchForProjects(fullPath, depth + 1);
            }
          }
        }
      } catch (error) {
        // Ignore permission errors
      }
    }
    
    await searchForProjects(searchDir);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            projects: projects.sort((a, b) => b.lastModified - a.lastModified),
            count: projects.length
          }, null, 2)
        }
      ]
    };
  }

  async createProject(args) {
    const { projectName, projectPath, template = '3D', unityVersion } = args;
    
    // Get Unity executable path
    const unityPath = await this.getUnityExecutablePath(unityVersion);
    
    const fullProjectPath = path.join(projectPath, projectName);
    
    // Create project using Unity command line
    const commandArgs = ['-createProject', fullProjectPath, '-template', template, '-quit', '-batchmode'];
    
    try {
      await execFileAsync(unityPath, commandArgs);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Project "${projectName}" created successfully`,
              path: fullProjectPath,
              template: template
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  async openProject(args) {
    const { projectPath } = args;
    
    // Check if project exists
    if (!await fs.pathExists(path.join(projectPath, 'ProjectSettings', 'ProjectSettings.asset'))) {
      throw new Error('Not a valid Unity project');
    }
    
    // Open with Unity Hub
    const commandArgs = ['-a', 'Unity Hub', '--args', '-projectPath', projectPath];
    
    try {
      await execFileAsync('open', commandArgs);
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Opening project: ${projectPath}`
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to open project: ${error.message}`);
    }
  }

  async listInstalledVersions() {
    const versions = [];
    
    try {
      const editors = await fs.readdir(UNITY_EDITORS_BASE);
      
      for (const editor of editors) {
        const unityPath = path.join(UNITY_EDITORS_BASE, editor, 'Unity.app', 'Contents', 'MacOS', 'Unity');
        if (await fs.pathExists(unityPath)) {
          versions.push({
            version: editor,
            path: unityPath
          });
        }
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              versions: versions.sort((a, b) => b.version.localeCompare(a.version)),
              count: versions.length
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list Unity versions: ${error.message}`);
    }
  }

  async createScript(args) {
    const { projectPath, scriptName, scriptPath = 'Scripts', template = 'MonoBehaviour', content } = args;
    
    const assetsPath = path.join(projectPath, 'Assets', scriptPath);
    await fs.ensureDir(assetsPath);
    
    const scriptFilePath = path.join(assetsPath, `${scriptName}.cs`);
    
    let scriptContent;
    
    if (template === 'Custom' && content) {
      scriptContent = content;
    } else if (template === 'MonoBehaviour') {
      scriptContent = `using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class ${scriptName} : MonoBehaviour
{
    // Start is called before the first frame update
    void Start()
    {
        
    }

    // Update is called once per frame
    void Update()
    {
        
    }
}`;
    } else if (template === 'ScriptableObject') {
      scriptContent = `using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "${scriptName}", menuName = "ScriptableObjects/${scriptName}", order = 1)]
public class ${scriptName} : ScriptableObject
{
    // Add your ScriptableObject data here
}`;
    }
    
    await fs.writeFile(scriptFilePath, scriptContent);
    
    // Create meta file
    const metaContent = `fileFormatVersion: 2
guid: ${generateGUID()}
MonoImporter:
  externalObjects: {}
  serializedVersion: 2
  defaultReferences: []
  executionOrder: 0
  icon: {instanceID: 0}
  userData: 
  assetBundleName: 
  assetBundleVariant: 
`;
    
    await fs.writeFile(`${scriptFilePath}.meta`, metaContent);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            message: `Script "${scriptName}" created successfully`,
            path: scriptFilePath
          }, null, 2)
        }
      ]
    };
  }

  async buildProject(args) {
    const { projectPath, buildTarget = 'StandaloneOSX', outputPath } = args;
    
    const unityPath = await this.getUnityExecutablePath();
    
    // Build command
    const commandArgs = ['-batchmode', '-quit', '-projectPath', projectPath, '-buildTarget', buildTarget, '-buildPath', outputPath];
    
    try {
      await execFileAsync(unityPath, commandArgs, { maxBuffer: 1024 * 1024 * 10 });
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: `Build completed successfully`,
              buildTarget: buildTarget,
              outputPath: outputPath
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Build failed: ${error.message}`);
    }
  }

  async getUnityExecutablePath(version) {
    if (version) {
      const specificPath = path.join(UNITY_EDITORS_BASE, version, 'Unity.app', 'Contents', 'MacOS', 'Unity');
      if (await fs.pathExists(specificPath)) {
        return specificPath;
      }
    }
    
    // Get latest version
    const versions = await fs.readdir(UNITY_EDITORS_BASE);
    const sortedVersions = versions.sort((a, b) => b.localeCompare(a));
    
    for (const ver of sortedVersions) {
      const unityPath = path.join(UNITY_EDITORS_BASE, ver, 'Unity.app', 'Contents', 'MacOS', 'Unity');
      if (await fs.pathExists(unityPath)) {
        return unityPath;
      }
    }
    
    throw new Error('No Unity installation found');
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[Unity MCP Server Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[Unity MCP Server] Started successfully');
  }
}

function generateGUID() {
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Start server
const server = new UnityMCPServer();
server.start().catch(console.error);
