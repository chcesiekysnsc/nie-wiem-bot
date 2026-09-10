/**
 * Singleton Command Registry
 * Laduje wszystkie komendy dokladnie raz do pamieci RAM.
 * Wszystkie instancje bota (niezaleznie od liczby kont) wspoldziela te sama mape komend.
 */

const fs = require('fs');
const path = require('path');

class CommandRegistry {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
    this.loaded = false;
  }

  load(commandsDir) {
    if (this.loaded) return this;
    
    const resolvedPath = path.resolve(commandsDir);
    if (!fs.existsSync(resolvedPath)) {
      console.warn(`[COMMAND-REGISTRY] Sciezka ${resolvedPath} nie istnieje.`);
      return this;
    }

    const files = fs.readdirSync(resolvedPath).filter(f => f.endsWith('.js'));
    let count = 0;

    for (const file of files) {
      try {
        const fullPath = path.join(resolvedPath, file);
        delete require.cache[require.resolve(fullPath)];
        const cmd = require(fullPath);

        if (cmd && cmd.name && typeof cmd.execute === 'function') {
          const name = String(cmd.name).toLowerCase();
          this.commands.set(name, cmd);
          count++;

          if (Array.isArray(cmd.aliases)) {
            for (const alias of cmd.aliases) {
              this.aliases.set(String(alias).toLowerCase(), name);
            }
          }
        }
      } catch (err) {
        console.error(`[COMMAND-REGISTRY] Blad wczytywania komendy z pliku ${file}:`, err.message);
      }
    }

    this.loaded = true;
    console.log(`[COMMAND-REGISTRY] Pomyslnie wczytano ${count} unikalnych komend (wspoldzielone dla wszystkich kont).`);
    return this;
  }

  get(commandName) {
    if (!commandName) return null;
    const lower = String(commandName).toLowerCase();
    if (this.commands.has(lower)) {
      return this.commands.get(lower);
    }
    const resolvedName = this.aliases.get(lower);
    if (resolvedName && this.commands.has(resolvedName)) {
      return this.commands.get(resolvedName);
    }
    return null;
  }

  getAll() {
    return Array.from(this.commands.values());
  }
}

module.exports = new CommandRegistry();
