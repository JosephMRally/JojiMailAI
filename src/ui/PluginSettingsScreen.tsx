/**
 * The plug-in settings screen (user-stories/typescript_email_ui.md): lists
 * PluginHost.list() with enable/disable toggles, renders each plug-in's
 * settings panel, and shows any auto-disable error message so a misbehaving
 * plug-in is visible in one place.
 */
import { useEffect, useState } from 'react';
import type { SettingsContribution } from '../plugins/MailPlugin';
import type { PluginHost, PluginListItem } from '../plugins/PluginHost';

export interface PluginSettingsScreenProps {
  pluginHost: PluginHost;
}

export function PluginSettingsScreen({ pluginHost }: PluginSettingsScreenProps) {
  const [items, setItems] = useState<PluginListItem[]>(() => pluginHost.list());
  const [panels, setPanels] = useState<SettingsContribution[]>([]);

  useEffect(() => {
    let live = true;
    void pluginHost.dispatchSettingsPanel().then((contributions) => {
      if (live) setPanels(contributions);
    });
    return () => {
      live = false;
    };
  }, [pluginHost, items]);

  const toggle = (pluginId: string, enabled: boolean): void => {
    pluginHost.setEnabled(pluginId, enabled);
    setItems(pluginHost.list());
  };

  return (
    <section>
      <h2>Plugins</h2>
      <ul aria-label="Installed plug-ins">
        {items.map((item) => (
          <li key={item.id}>
            <span>{item.name}</span> <span>{item.version}</span>
            <label>
              Enable {item.name}
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(event) => toggle(item.id, event.target.checked)}
              />
            </label>
            {item.error !== undefined && <p>{item.error}</p>}
          </li>
        ))}
      </ul>
      {panels.map((panel) => (
        <section key={panel.pluginId} aria-label={panel.title}>
          <h3>{panel.title}</h3>
          {panel.fields.map((field) => (
            <p key={field.key}>
              {field.label}: {field.value}
            </p>
          ))}
        </section>
      ))}
    </section>
  );
}
