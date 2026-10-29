# Unity MCP Server

Ein MCP (Model Context Protocol) Server für die Integration von Unity mit Claude.

## Features

- **unity_list_projects**: Listet alle Unity-Projekte in einem Verzeichnis auf
- **unity_create_project**: Erstellt ein neues Unity-Projekt
- **unity_open_project**: Öffnet ein Unity-Projekt
- **unity_list_installed_versions**: Zeigt alle installierten Unity-Versionen
- **unity_create_script**: Erstellt C#-Skripte in Unity-Projekten
- **unity_build_project**: Baut Unity-Projekte

## Installation

1. Dependencies installieren:
```bash
npm install
```

2. In Claude Desktop konfigurieren:
Füge folgende Konfiguration zu deiner Claude Desktop config hinzu:

```json
{
  "unity": {
    "command": "node",
    "args": ["/Users/michaelnikolaus/unity-mcp-server/index.js"],
    "env": {}
  }
}
```

## Verwendung

Nach der Installation kannst du die Unity-Tools in Claude verwenden:

- **Projekte finden**: `unity_list_projects`
- **Neues Projekt**: `unity_create_project` mit Name und Pfad
- **Projekt öffnen**: `unity_open_project` mit Projektpfad
- **Script erstellen**: `unity_create_script` für neue C#-Skripte
- **Projekt bauen**: `unity_build_project` für Builds

## Voraussetzungen

- Unity Hub installiert
- Mindestens eine Unity-Version installiert
- macOS (für andere Plattformen müssen Pfade angepasst werden)

## Tests

`npm ci --ignore-scripts` und `npm test` prüfen die MCP-Verbindung und alle sechs Tools offline. Tests verwenden temporäre Projektdateien und fangen Unity-/Hub-Programmstarts ab; eine Unity-Installation ist dafür nicht nötig. Echte Editor- und Build-Vorgänge müssen zusätzlich auf macOS geprüft werden.

CI führt diese Tests und `npm audit --audit-level=moderate` unter Node 20 und 24 aus.

## Author

Michael Nikolaus (Minicon eG)
