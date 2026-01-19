import { Fragment, useEffect, useMemo, useState } from 'react';
import { Grid, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Settings } from '../../@types/main.d';
import { ItemFoundLogEntry, loadItemFoundLog } from '../../utils/itemLog';
import { getHolyGrailSeedData } from '../../../electron/lib/holyGrailSeedData';
import { runesMapping } from '../../../electron/lib/runesMapping';
import { runewordsMapping } from '../../../electron/lib/runewordsMapping';
import { simplifyItemName } from '../../utils/objects';

type HistoryProps = {
  appSettings: Settings,
}

export function History({ appSettings }: HistoryProps) {
  const { t } = useTranslation();
  // Maintain a local copy of the persistent item-found log for display.
  const [itemFoundLog, setItemFoundLog] = useState<ItemFoundLogEntry[]>(() => loadItemFoundLog());

  // Format the user's local time string for individual log rows.
  const formatFoundTime = (foundAt: string) => new Date(foundAt).toLocaleTimeString();

  // Build a lookup that maps item IDs to human-readable names for the log.
  const itemNameLookup = useMemo(() => {
    // Collect human-readable names keyed by the simplified item ID.
    const nameLookup: Record<string, string> = {};
    // Fetch seed data so the log can resolve the latest item names.
    const holyGrailSeedData = getHolyGrailSeedData(appSettings, false);

    // Helper to add a display name using the same ID format as the log.
    const addDisplayName = (name: string) => {
      nameLookup[simplifyItemName(name)] = name;
    };

    // Helper to walk nested seed data objects and capture leaf keys.
    const walkSeedData = (node: Record<string, any>) => {
      Object.keys(node).forEach((key) => {
        const value = node[key];
        if (value && typeof value === 'object' && Object.keys(value).length > 0) {
          walkSeedData(value);
          return;
        }
        addDisplayName(key);
      });
    };

    // Add unique and set item names from the Holy Grail seed data.
    walkSeedData(holyGrailSeedData.uniques);
    walkSeedData(holyGrailSeedData.sets);

    // Add rune names using the canonical mapping (matches the item ID format).
    Object.values(runesMapping).forEach((rune) => {
      nameLookup[simplifyItemName(rune.name)] = rune.name;
    });

    // Add runeword names using the runeword ID format used in the log.
    Object.keys(runewordsMapping).forEach((runewordName) => {
      nameLookup[`runeword${simplifyItemName(runewordName)}`] = runewordName;
    });

    return nameLookup;
  }, [appSettings]);

  // Resolve the display name for a logged item ID, accounting for ethereal IDs.
  const getItemDisplayName = (itemId: string) => {
    // Ethereal items are prefixed in the log, so strip the prefix for lookup.
    const isEtherealItem = itemId.startsWith('ether');
    const normalizedId = isEtherealItem ? itemId.replace(/^ether/, '') : itemId;
    const resolvedName = itemNameLookup[normalizedId] || normalizedId;

    // Prefix the name with "Ethereal" when appropriate for clarity.
    return isEtherealItem ? `${t('Ethereal')} ${resolvedName}` : resolvedName;
  };

  // Resolve a human-readable character name for the log entry.
  const getFoundByName = (entry: ItemFoundLogEntry) => {
    // Prefer the recorded character/save name when present.
    if (entry.foundBy) {
      return entry.foundBy;
    }

    // Fall back to an "Unknown" label when the log entry predates this field.
    return t('Unknown');
  };

  // Resolve a user-facing item type label for the log entry.
  const getItemTypeLabel = (entry: ItemFoundLogEntry) => {
    // Prefer the persisted item type when present.
    if (entry.itemType) {
      return t(entry.itemType);
    }

    // Fall back to an "Unknown" label when the log entry predates this field.
    return t('Unknown');
  };

  // Resolve a user-facing rarity label for the log entry.
  const getItemRarityLabel = (entry: ItemFoundLogEntry) => {
    // Prefer the persisted rarity when present.
    if (entry.rarity) {
      return t(entry.rarity);
    }

    // Fall back to an "Unknown" label when the log entry predates this field.
    return t('Unknown');
  };

  // Keep the UI in sync when the persistent log is updated elsewhere.
  useEffect(() => {
    // Refresh the log by re-reading from persistent storage.
    const refreshLog = () => setItemFoundLog(loadItemFoundLog());

    // Listen for in-app updates as well as storage updates from other windows.
    window.addEventListener('holyGrailItemFoundLogUpdated', refreshLog);
    window.addEventListener('storage', refreshLog);

    // Clean up listeners when the component is unmounted.
    return () => {
      window.removeEventListener('holyGrailItemFoundLogUpdated', refreshLog);
      window.removeEventListener('storage', refreshLog);
    };
  }, []);

  // Display the most recent discoveries first in the log view.
  const orderedItemFoundLog = itemFoundLog.slice().reverse();
  // Group log entries by the user's local date for clearer separation.
  const groupedItemFoundLog = useMemo(() => {
    // Preserve ordering while grouping by local date.
    const groupedEntries: Array<{ dateLabel: string; entries: ItemFoundLogEntry[] }> = [];
    const groupIndex = new Map<string, number>();

    orderedItemFoundLog.forEach((entry) => {
      const dateLabel = new Date(entry.foundAt).toLocaleDateString();
      const existingGroupIndex = groupIndex.get(dateLabel);

      if (existingGroupIndex === undefined) {
        groupIndex.set(dateLabel, groupedEntries.length);
        groupedEntries.push({ dateLabel, entries: [entry] });
        return;
      }

      groupedEntries[existingGroupIndex].entries.push(entry);
    });

    return groupedEntries;
  }, [orderedItemFoundLog]);

  return (
    <Grid container style={{ marginTop: 50, alignItems: 'center', justifyContent: 'center' }}>
      <Grid item xs={8}>
        <Typography variant="h6" gutterBottom>{t("History")}</Typography>
        {orderedItemFoundLog.length === 0 && (
          <Typography variant="body2">{t("No items found yet")}</Typography>
        )}
        {groupedItemFoundLog.map((group) => (
          <Fragment key={`group-${group.dateLabel}`}>
            {/* Date header separates each timeline group by local date. */}
            <Typography variant="subtitle2" style={{ marginTop: 16 }}>{group.dateLabel}</Typography>
            {/* Timeline container renders a vertical line with entry markers. */}
            <div style={{ borderLeft: '2px solid #e0e0e0', marginLeft: 12, paddingLeft: 16 }}>
              {group.entries.map((entry, index) => (
                <div
                  key={`${entry.id}-${entry.foundAt}-${index}`}
                  style={{ position: 'relative', paddingBottom: 16 }}
                >
                  {/* Timeline dot represents the exact discovery event. */}
                  <span
                    style={{
                      position: 'absolute',
                      left: -22,
                      top: 4,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: '#1976d2',
                    }}
                  />
                  {/* Horizontal layout keeps each log entry on a single line. */}
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <Typography variant="body2">
                      {formatFoundTime(entry.foundAt)}
                    </Typography>
                    <Typography variant="body2">
                      • {getFoundByName(entry)}
                    </Typography>
                    <Typography variant="subtitle1" style={{ flex: '1 1 220px' }}>
                      {getItemDisplayName(entry.id)}
                    </Typography>
                    <Typography variant="caption" style={{ opacity: 0.8 }}>
                      {getItemTypeLabel(entry)}
                    </Typography>
                    <Typography variant="caption" style={{ opacity: 0.8 }}>
                      {getItemRarityLabel(entry)}
                    </Typography>
                    <Typography variant="caption" style={{ opacity: 0.6 }}>
                      {entry.id}
                    </Typography>
                  </div>
                </div>
              ))}
            </div>
          </Fragment>
        ))}
      </Grid>
    </Grid>
  );
}
