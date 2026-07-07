/**
 * App entry point (user-stories/typescript_email_ui.md): opens the on-device
 * SQLite database (via the jeep-sqlite web store when running in a browser),
 * composes every backend at the composition root, and mounts the React UI.
 * Together with src/composition.ts this is the only place concrete
 * provider/intelligence/store/plug-in classes are named.
 */
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import { composeApp } from './composition';
import { CapacitorDbHandle } from './store/CapacitorDbHandle';
import { App } from './ui/App';

const DB_NAME = 'jojimail';

/**
 * On web, @capacitor-community/sqlite delegates to the jeep-sqlite custom
 * element (wasm-backed IndexedDB persistence); it must be registered, in the
 * DOM, and its web store initialized before createConnection. Native
 * platforms use the plugin directly and skip all of this.
 */
async function prepareWebStore(sqlite: SQLiteConnection): Promise<void> {
  const { defineCustomElements } = await import('jeep-sqlite/loader');
  defineCustomElements(window);
  document.body.appendChild(document.createElement('jeep-sqlite'));
  await customElements.whenDefined('jeep-sqlite');
  await sqlite.initWebStore();
}

async function start(): Promise<void> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  if (Capacitor.getPlatform() === 'web') {
    await prepareWebStore(sqlite);
  }
  const connection = await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await connection.open();

  const services = composeApp({
    dbHandle: new CapacitorDbHandle(connection),
    settingsStorage: window.localStorage,
  });

  const container = document.getElementById('root');
  if (!container) throw new Error('index.html must provide a #root element');
  createRoot(container).render(
    <App
      registry={services.registry}
      intelligence={services.intelligence}
      store={services.store}
      pluginHost={services.pluginHost}
    />,
  );
}

void start();
