/**
 * App entry point (user-stories/typescript_email_ui.md): opens the on-device
 * SQLite database, composes every backend at the composition root, and mounts
 * the React UI. Together with src/composition.ts this is the only place
 * concrete provider/intelligence/store/plug-in classes are named.
 */
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { createRoot } from 'react-dom/client';
import { composeApp } from './composition';
import { CapacitorDbHandle } from './store/CapacitorDbHandle';
import { App } from './ui/App';

const DB_NAME = 'jojimail';

async function start(): Promise<void> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
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
