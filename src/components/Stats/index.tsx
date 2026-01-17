import { Grid, Typography, Table, TableBody, TableCell, TableContainer, TableRow, TableHead } from '@mui/material';
import { GrailType, HolyGrailStats, SaveFileStats, Settings } from '../../@types/main.d';

import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { Fragment, useEffect, useMemo, useState } from 'react';

import { StatisticsLine } from './line';
import { Win } from './win';
import { getHolyGrailSeedData } from '../../../electron/lib/holyGrailSeedData';
import { useTranslation } from 'react-i18next';
import Circle from './circle';
import { ItemFoundLogEntry, loadItemFoundLog } from '../../utils/itemLog';
import { runesMapping } from '../../../electron/lib/runesMapping';
import { runewordsMapping } from '../../../electron/lib/runewordsMapping';
import { simplifyItemName } from '../../utils/objects';

type StatsProps = {
  appSettings: Settings,
  holyGrailStats: HolyGrailStats,
  stats?: SaveFileStats,
  noAnimation?: boolean,
  onlyCircle?: boolean,
}

export function Statistics({ stats, noAnimation, appSettings, holyGrailStats, onlyCircle }: StatsProps) {
  const holyGrailSeedData = getHolyGrailSeedData(appSettings, false)
  const { t } = useTranslation();
  // Maintain a local copy of the persistent item-found log for display.
  const [itemFoundLog, setItemFoundLog] = useState<ItemFoundLogEntry[]>(() => loadItemFoundLog());

  // Format the user's local time string for individual log rows.
  const formatFoundTime = (foundAt: string) => new Date(foundAt).toLocaleTimeString();

  // Build a lookup that maps item IDs to human-readable names for the log.
  const itemNameLookup = useMemo(() => {
    // Collect human-readable names keyed by the simplified item ID.
    const nameLookup: Record<string, string> = {};

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
  }, [holyGrailSeedData]);

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

  const showNormal = appSettings.grailType !== GrailType.Ethereal;
  const showEthereal = appSettings.grailType === GrailType.Ethereal || appSettings.grailType === GrailType.Each;
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

  let counterTotal: number | false = false;
  let counterOwned: number | false = false;
  let subCounterTotal: number | false = false;
  let subCounterOwned: number | false = false;
  let counterPercent: number | false = false;
  let owned: number = 0;
  let total: number = 0;
  
  const grandOwned = holyGrailStats.normal.total.owned + holyGrailStats.ethereal.total.owned
    + (appSettings.grailRunes ? holyGrailStats.runes.owned : 0)
    + (appSettings.grailRunewords ? holyGrailStats.runewords.owned : 0);
  const grandExists = holyGrailStats.normal.total.exists + holyGrailStats.ethereal.total.exists
    + (appSettings.grailRunes ? holyGrailStats.runes.exists : 0)
    + (appSettings.grailRunewords ? holyGrailStats.runewords.exists : 0);
  const grandRemaining = grandExists - grandOwned;
  const grandPercent = (grandOwned / grandExists) * 100;
  const grandTotal = {
    exists: grandExists,
    owned: grandOwned,
    remaining: grandRemaining,
    percent: grandPercent > 99.5 && grandPercent < 100 ? 99 : Math.round(grandPercent),
  }

  switch (appSettings.grailType) {
    case GrailType.Normal:
    case GrailType.Both:
      counterTotal = holyGrailStats.normal.total.exists
        + (appSettings.grailRunes ? holyGrailStats.runes.exists : 0)
        + (appSettings.grailRunewords ? holyGrailStats.runewords.exists : 0);
      counterOwned = holyGrailStats.normal.total.owned
        + (appSettings.grailRunes ? holyGrailStats.runes.owned : 0)
        + (appSettings.grailRunewords ? holyGrailStats.runewords.owned : 0);
      counterPercent = (counterOwned / counterTotal) * 100;
      counterPercent = counterPercent > 99.5 && counterPercent < 100 ? 99 : Math.round(counterPercent);
      owned = counterOwned;
      total = counterTotal;
      break;
    case GrailType.Ethereal:
      counterTotal = holyGrailStats.ethereal.total.exists
        + (appSettings.grailRunes ? holyGrailStats.runes.exists : 0)
        + (appSettings.grailRunewords ? holyGrailStats.runewords.exists : 0);
      counterOwned = holyGrailStats.ethereal.total.owned
        + (appSettings.grailRunes ? holyGrailStats.runes.owned : 0)
        + (appSettings.grailRunewords ? holyGrailStats.runewords.owned : 0);
      counterPercent = (counterOwned / counterTotal) * 100;
      counterPercent = counterPercent > 99.5 && counterPercent < 100 ? 99 : Math.round(counterPercent);    
      owned = counterOwned;
      total = counterTotal;
      break;
    case GrailType.Each:
      counterTotal = holyGrailStats.normal.total.exists
        + (appSettings.grailRunes ? holyGrailStats.runes.exists : 0)
        + (appSettings.grailRunewords ? holyGrailStats.runewords.exists : 0);
      counterOwned = holyGrailStats.normal.total.owned
        + (appSettings.grailRunes ? holyGrailStats.runes.owned : 0)
        + (appSettings.grailRunewords ? holyGrailStats.runewords.owned : 0);
      subCounterTotal = holyGrailStats.ethereal.total.exists;
      subCounterOwned = holyGrailStats.ethereal.total.owned;
      owned = counterOwned + subCounterOwned;
      total = counterTotal + subCounterTotal;
      counterPercent = (owned / total) * 100;
      counterPercent = counterPercent > 99.5 && counterPercent < 100 ? 99 : Math.round(counterPercent);    
      break;
  }

  if (onlyCircle) {
    return <Circle
      animated={!noAnimation}
      owned={counterOwned}
      total={counterTotal}
      percent={counterPercent}
      subOwned={subCounterOwned}
      subTotal={subCounterTotal}
    />
  }

  return (
    <>
      <Grid container spacing={2} style={{ marginTop: 50, alignItems: 'center', justifyContent: 'center'}}>
        <Grid item md={6}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell></TableCell>
                  <TableCell align="center">{t('Exists')}</TableCell>
                  <TableCell align="center">{t('Owned')}</TableCell>
                  <TableCell align="center">{t('Remaining')}</TableCell>
                  <TableCell align="center">{t('% Completed')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {showNormal && <StatisticsLine title={t("Unique armor")} stats={holyGrailStats.normal.armor} />}
                {showNormal && <StatisticsLine title={t("Unique weapons")} stats={holyGrailStats.normal.weapon} />}
                {showNormal && <StatisticsLine title={t("Unique other")} stats={holyGrailStats.normal.other} />}
                {showNormal && <StatisticsLine title={t("Sets")} stats={holyGrailStats.normal.sets} />}
                {showEthereal && <StatisticsLine title={t("Ethereal unique armor")} stats={holyGrailStats.ethereal.armor} />}
                {showEthereal && <StatisticsLine title={t("Ethereal unique weapons")} stats={holyGrailStats.ethereal.weapon} />}
                {showEthereal && <StatisticsLine title={t("Ethereal unique other")} stats={holyGrailStats.ethereal.other} />}
                {appSettings.grailRunes && <StatisticsLine title={t("Runes")} bold stats={holyGrailStats.runes} />}
                {appSettings.grailRunewords && <StatisticsLine title={t("Runewords")} bold stats={holyGrailStats.runewords} />}
                {showNormal && appSettings.grailType !== GrailType.Each && <StatisticsLine bolder title={t("Total")} stats={grandTotal} />}
                {showNormal && appSettings.grailType === GrailType.Each && <StatisticsLine bold title={t("Total normal")} stats={holyGrailStats.normal.total} />}
                {showEthereal && appSettings.grailType === GrailType.Each && <StatisticsLine bold title={t("Total ethereal")} stats={holyGrailStats.ethereal.total} />}
                {showEthereal && appSettings.grailType !== GrailType.Each && <StatisticsLine bolder title={t("Total")} stats={grandTotal} />}
                {appSettings.grailType === GrailType.Each && <StatisticsLine bolder title={t("Total")} stats={grandTotal} />}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
        <Grid item md={4}>
          <div style={{ width: 250, height: 300, textAlign: 'center', margin: 'auto' }}>
            <Typography variant="h5" gutterBottom>{t("Progress:")}</Typography>
            <Circle
              animated={!noAnimation}
              owned={counterOwned}
              total={counterTotal}
              percent={counterPercent}
              subOwned={subCounterOwned}
              subTotal={subCounterTotal}
            />
          </div>
        </Grid>
        <Grid container style={{ marginTop: 50, alignItems: 'center', justifyContent: 'center' }}>
          <Grid item xs={8}>
            <Typography variant="h6" gutterBottom>{t("Found items log")}</Typography>
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
                      <Typography variant="body2">
                        {formatFoundTime(entry.foundAt)} • {getFoundByName(entry)}
                      </Typography>
                      <Typography variant="subtitle1">{getItemDisplayName(entry.id)}</Typography>
                      <Typography variant="caption">{entry.id}</Typography>
                    </div>
                  ))}
                </div>
              </Fragment>
            ))}
          </Grid>
        </Grid>
        {stats &&
          <>
            <Grid container style={{ marginTop: 50, alignItems: 'center', justifyContent: 'center' }}>
              <Grid item xs={4}>
                <Accordion>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Typography>{t("Save files summary")}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableCell>{t("Filename")}</TableCell>
                            <TableCell>{t("Items read")}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {Object.keys(stats).map(filename => (
                            <TableRow key={filename}>
                              <TableCell>{filename}</TableCell>
                              <TableCell>{
                                stats[filename] === null
                                  ? <span style={{color: 'red'}}>{t("Error")}</span>
                                  : stats[filename]
                              }</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </AccordionDetails>
                </Accordion>
              </Grid>
            </Grid>
          </>
        }
        {!noAnimation && total === owned && <Win/>}
      </Grid>
    </>
  );
}
