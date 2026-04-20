import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useInAppLogger } from "../hooks/loggerContext";
import { useInAppLogs } from "../hooks/useInAppLogs";
import { JsonTreeView, type JsonTreeViewTheme } from "./JsonTreeView";
import type { InAppLogger, LogEntry, LogFilter } from "../types";

const runtimeLogFilters: Array<{ key: LogFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "action", label: "Actions" },
  { key: "api", label: "API" },
  { key: "console", label: "Console" },
  { key: "error", label: "Errors" },
  { key: "custom", label: "Custom" },
];

export interface InAppLogViewerTheme {
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  mutedTextColor: string;
  accentColor: string;
  warnColor: string;
  errorColor: string;
  actionColor: string;
  apiColor: string;
}

export type InAppLogListMode = "virtualized" | "static";

interface RuntimeLogMetaBadge {
  id: string;
  label: string;
}

type ScrollToEndRef = {
  scrollToEnd: (options?: { animated?: boolean }) => void;
};

export interface InAppLogViewerProps {
  logger?: InAppLogger;
  title?: string;
  closeLabel?: string;
  initialFilter?: LogFilter;
  style?: StyleProp<ViewStyle>;
  maxHeight?: number;
  theme?: Partial<InAppLogViewerTheme>;
  testIDPrefix?: string;
  onExport?: (payload: string, entries: LogEntry[]) => void;
  onClose?: () => void;
  listMode?: InAppLogListMode;
  autoScrollToEnd?: boolean;
}

const defaultTheme: InAppLogViewerTheme = {
  backgroundColor: "rgba(0,0,0,0.88)",
  textColor: "#E6EDF3",
  borderColor: "#2A2A2A",
  mutedTextColor: "#8B949E",
  accentColor: "#58A6FF",
  warnColor: "#D29922",
  errorColor: "#F85149",
  actionColor: "#3FB950",
  apiColor: "#79C0FF",
};

const formatLogTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString("en-GB", { hour12: false });
  const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
  return `${time}.${milliseconds}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const truncateLabel = (value: string, maxLength = 42): string => {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
};

const toIntegerString = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.round(value));
  }

  if (
    typeof value === "string" &&
    value.trim().length > 0 &&
    Number.isFinite(Number(value))
  ) {
    return String(Math.round(Number(value)));
  }

  return null;
};

const MAX_DURATION_BADGE_MS = 30000;

const formatDurationBadge = (durationMsText: string): string => {
  const durationMs = Number(durationMsText);
  if (!Number.isFinite(durationMs)) {
    return durationMsText;
  }

  const roundedDurationMs = Math.max(0, Math.round(durationMs));
  if (roundedDurationMs > MAX_DURATION_BADGE_MS) {
    return `${MAX_DURATION_BADGE_MS}+`;
  }

  return `${roundedDurationMs}ms`;
};

const getStringValue = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
};

const getActionTypeLabel = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalizedValue = value.trim();
    if (normalizedValue) {
      return truncateLabel(normalizedValue, 36);
    }

    return null;
  }

  if (
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return truncateLabel(String(value), 36);
  }

  return null;
};

export type ParsedApiSummary = {
  stage: "request" | "response" | "error" | null;
  method: string | null;
  url: string | null;
  status: string | null;
  durationMs: string | null;
};

export const parseApiSummary = (summary: string): ParsedApiSummary => {
  const parsedSummary: ParsedApiSummary = {
    stage: null,
    method: null,
    url: null,
    status: null,
    durationMs: null,
  };

  const trimmedSummary = summary.trim();
  if (!trimmedSummary) {
    return parsedSummary;
  }

  const stageMatch = trimmedSummary.match(/^\[(REQ|RES|ERR)\]\s+/i);
  if (!stageMatch) {
    return parsedSummary;
  }

  const stageCode = stageMatch[1]?.toUpperCase();
  if (stageCode === "REQ") {
    parsedSummary.stage = "request";
  } else if (stageCode === "RES") {
    parsedSummary.stage = "response";
  } else if (stageCode === "ERR") {
    parsedSummary.stage = "error";
  }

  const methodMatch = trimmedSummary.match(
    /^\[(?:REQ|RES|ERR)\]\s+([A-Z]+)\s+/i,
  );
  if (methodMatch?.[1]) {
    parsedSummary.method = methodMatch[1].toUpperCase();
  }

  const stagePrefixLength = stageMatch[0].length;
  const withoutStagePrefix = trimmedSummary.slice(stagePrefixLength).trim();
  const withoutMethodPrefix =
    parsedSummary.method &&
    withoutStagePrefix.toUpperCase().startsWith(`${parsedSummary.method} `)
      ? withoutStagePrefix.slice(parsedSummary.method.length).trim()
      : withoutStagePrefix;

  if (withoutMethodPrefix) {
    const responseSuffixIndex = withoutMethodPrefix.indexOf(" -> ");
    parsedSummary.url = (
      responseSuffixIndex >= 0
        ? withoutMethodPrefix.slice(0, responseSuffixIndex)
        : withoutMethodPrefix
    ).trim();
  }

  if (parsedSummary.stage === "response") {
    const statusMatch = trimmedSummary.match(/->\s*(\d{3})(?:\s*\(|\s*$)/);
    if (statusMatch?.[1]) {
      parsedSummary.status = statusMatch[1];
    }
  }

  const durationMatch = trimmedSummary.match(/\((\d+)ms\)\s*$/);
  if (durationMatch?.[1]) {
    parsedSummary.durationMs = durationMatch[1];
  }

  return parsedSummary;
};

export const buildCollapsedSummary = (logEntry: LogEntry): string => {
  const details = isRecord(logEntry.details) ? logEntry.details : null;

  if (logEntry.source === "api" && details) {
    const parsedSummary = parseApiSummary(logEntry.summary);
    const stageValue =
      getStringValue(details.stage)?.toLowerCase() ?? parsedSummary.stage;
    const urlValue = getStringValue(details.url) ?? parsedSummary.url;

    if ((stageValue === "response" || stageValue === "request") && urlValue) {
      return urlValue;
    }
  }

  if (logEntry.source === "api") {
    const parsedSummary = parseApiSummary(logEntry.summary);
    if (
      (parsedSummary.stage === "response" ||
        parsedSummary.stage === "request") &&
      parsedSummary.url
    ) {
      return parsedSummary.url;
    }
  }

  if (logEntry.source !== "action") {
    return logEntry.summary;
  }

  if (!details) {
    return logEntry.summary;
  }

  const actionTypeLabel = getActionTypeLabel(details.type);
  if (!actionTypeLabel) {
    return logEntry.summary;
  }

  return actionTypeLabel;
};

export const buildRuntimeLogMeta = (
  logEntry: LogEntry,
): {
  badges: RuntimeLogMetaBadge[];
  hiddenDetailKeys: string[];
} => {
  const details = isRecord(logEntry.details) ? logEntry.details : null;
  if (!details) {
    return { badges: [], hiddenDetailKeys: [] };
  }

  const badges: RuntimeLogMetaBadge[] = [];
  const hiddenDetailKeys: string[] = [];
  const appendBadge = (id: string, label: string, detailKeyToHide?: string) => {
    badges.push({ id, label });
    if (detailKeyToHide) {
      hiddenDetailKeys.push(detailKeyToHide);
    }
  };

  if (logEntry.source === "api") {
    const parsedSummary = parseApiSummary(logEntry.summary);
    const normalizedStageValue =
      getStringValue(details.stage)?.toLowerCase() ?? parsedSummary.stage;

    if (
      normalizedStageValue !== "response" &&
      normalizedStageValue !== "request"
    ) {
      return { badges: [], hiddenDetailKeys: [] };
    }

    appendBadge(
      "type",
      normalizedStageValue === "response" ? "↓ RESPONSE" : "↑ REQUEST",
      "stage",
    );

    if (normalizedStageValue === "response") {
      const statusValue =
        toIntegerString(details.status) ?? parsedSummary.status;
      if (statusValue) {
        appendBadge("status", statusValue, "status");
      }

      const durationValue =
        toIntegerString(details.durationMs) ?? parsedSummary.durationMs;
      if (durationValue) {
        appendBadge(
          "duration",
          formatDurationBadge(durationValue),
          "durationMs",
        );
      }
    }

    const methodValue = getStringValue(details.method) ?? parsedSummary.method;
    if (methodValue) {
      appendBadge("method", methodValue.toUpperCase(), "method");
    }

    const urlValue = getStringValue(details.url) ?? parsedSummary.url;
    if (urlValue) {
      hiddenDetailKeys.push("url");
    }

    const uniqueHiddenDetailKeys = Array.from(new Set(hiddenDetailKeys));
    return { badges, hiddenDetailKeys: uniqueHiddenDetailKeys };
  }

  return { badges, hiddenDetailKeys };
};

export const getExpandedDetailsValue = (
  details: unknown,
  hiddenDetailKeys: string[],
): unknown => {
  if (!isRecord(details) || hiddenDetailKeys.length === 0) {
    return details;
  }

  const hiddenKeysSet = new Set(hiddenDetailKeys);
  const normalizedDetails = Object.fromEntries(
    Object.entries(details).filter(([key]) => {
      return !hiddenKeysSet.has(key);
    }),
  );

  if (Object.keys(normalizedDetails).length === 0) {
    return undefined;
  }

  return normalizedDetails;
};

const normalizeSearchQuery = (value: string): string => {
  return value.trim().toLowerCase();
};

const getDetailsSearchText = (details: unknown): string => {
  if (typeof details === "undefined" || details === null) {
    return "";
  }

  if (typeof details === "string") {
    return details.toLowerCase();
  }

  try {
    return JSON.stringify(details).toLowerCase();
  } catch {
    return String(details).toLowerCase();
  }
};

const isLogEntryMatchingSearchQuery = (
  logEntry: LogEntry,
  normalizedSearchQuery: string,
): boolean => {
  if (!normalizedSearchQuery) {
    return true;
  }

  const baseSearchText =
    `${logEntry.summary} ${logEntry.source} ${logEntry.level}`.toLowerCase();
  if (baseSearchText.includes(normalizedSearchQuery)) {
    return true;
  }

  return getDetailsSearchText(logEntry.details).includes(normalizedSearchQuery);
};

const buildStyles = (theme: InAppLogViewerTheme) => {
  return StyleSheet.create({
    container: {
      width: "100%",
      borderWidth: 1,
      borderColor: theme.borderColor,
      backgroundColor: theme.backgroundColor,
      borderRadius: 10,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderColor,
    },
    title: {
      color: theme.textColor,
      fontSize: 14,
      fontWeight: "700",
    },
    headerActions: {
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
    },
    actionButton: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: theme.borderColor,
      backgroundColor: "rgba(255, 255, 255, 0.03)",
    },
    actionButtonText: {
      color: theme.textColor,
      fontSize: 12,
      fontWeight: "600",
    },
    filterRow: {
      flexGrow: 0,
      flexShrink: 0,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderColor,
    },
    filterRowContent: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    filterButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.borderColor,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    filterButtonWithSpacing: {
      marginRight: 6,
    },
    filterButtonActive: {
      borderColor: theme.accentColor,
      backgroundColor: "rgba(255, 255, 255, 0.08)",
    },
    filterLabel: {
      color: theme.mutedTextColor,
      fontSize: 12,
      fontWeight: "600",
    },
    filterLabelActive: {
      color: theme.accentColor,
    },
    searchContainer: {
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderColor,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: theme.borderColor,
      borderRadius: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      color: theme.textColor,
      backgroundColor: "rgba(255,255,255,0.04)",
      fontSize: 12,
    },
    listContent: {
      paddingTop: 8,
      paddingHorizontal: 8,
      paddingBottom: 8,
    },
    listViewport: {
      flex: 1,
    },
    row: {
      borderWidth: 1,
      borderColor: theme.borderColor,
      borderRadius: 8,
      backgroundColor: "rgba(255, 255, 255, 0.02)",
      overflow: "hidden",
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: 8,
    },
    metaSection: {
      marginBottom: 4,
    },
    metaText: {
      color: theme.mutedTextColor,
      fontSize: 11,
      flexShrink: 1,
      paddingTop: 1,
    },
    metaBadgesBar: {
      flexDirection: "row",
      marginTop: -8,
      marginBottom: 6,
      marginHorizontal: -10,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderColor,
      backgroundColor: "rgba(255, 255, 255, 0.03)",
    },
    metaBadgeCell: {
      flex: 1,
      minWidth: 0,
      paddingHorizontal: 6,
      paddingVertical: 3,
      alignItems: "center",
      justifyContent: "center",
    },
    metaBadgeCellWithDivider: {
      borderLeftWidth: 1,
      borderLeftColor: theme.borderColor,
    },
    metaBadgeCellText: {
      color: theme.mutedTextColor,
      fontSize: 10,
      lineHeight: 12,
      fontWeight: "600",
      textAlign: "center",
    },
    summary: {
      color: theme.textColor,
      fontSize: 12,
      lineHeight: 18,
    },
    summaryWarn: {
      color: theme.warnColor,
    },
    summaryError: {
      color: theme.errorColor,
    },
    summaryAction: {
      color: theme.actionColor,
    },
    summaryApi: {
      color: theme.apiColor,
    },
    detailsContainer: {
      marginTop: 6,
    },
    detailsEmpty: {
      color: theme.mutedTextColor,
      fontSize: 11,
      lineHeight: 16,
    },
    expandHint: {
      marginTop: 4,
      color: theme.mutedTextColor,
      fontSize: 10,
      lineHeight: 14,
    },
    empty: {
      color: theme.mutedTextColor,
      textAlign: "center",
      paddingVertical: 14,
    },
  });
};

type ViewerStyles = ReturnType<typeof buildStyles>;

interface RuntimeLogRowProps {
  logEntry: LogEntry;
  detailsTheme: Partial<JsonTreeViewTheme>;
  styles: ViewerStyles;
  testIDPrefix?: string;
}

const RuntimeLogRow = memo(
  ({ logEntry, detailsTheme, styles, testIDPrefix }: RuntimeLogRowProps) => {
    const [isExpandedState, setIsExpandedState] = useState(false);

    const toggleExpanded = useCallback(() => {
      setIsExpandedState((previousState) => !previousState);
    }, []);

    const runtimeLogMeta = useMemo(() => {
      return buildRuntimeLogMeta(logEntry);
    }, [logEntry]);

    const expandedDetails = useMemo(() => {
      return getExpandedDetailsValue(
        logEntry.details,
        runtimeLogMeta.hiddenDetailKeys,
      );
    }, [logEntry.details, runtimeLogMeta.hiddenDetailKeys]);

    const collapsedSummary = useMemo(() => {
      return buildCollapsedSummary(logEntry);
    }, [logEntry]);

    const displayedSummary = useMemo(() => {
      if (logEntry.source === "api") {
        return collapsedSummary;
      }

      return isExpandedState ? logEntry.summary : collapsedSummary;
    }, [collapsedSummary, isExpandedState, logEntry.source, logEntry.summary]);

    const summaryStyles = useMemo(() => {
      const output: Array<StyleProp<TextStyle>> = [styles.summary];

      if (logEntry.level === "warn") {
        output.push(styles.summaryWarn);
      }

      if (logEntry.level === "error") {
        output.push(styles.summaryError);
      }

      if (logEntry.source === "action") {
        output.push(styles.summaryAction);
      }

      if (logEntry.source === "api") {
        output.push(styles.summaryApi);
      }

      return output;
    }, [
      logEntry.level,
      logEntry.source,
      styles.summary,
      styles.summaryAction,
      styles.summaryApi,
      styles.summaryError,
      styles.summaryWarn,
    ]);

    return (
      <Pressable
        testID={testIDPrefix ? `${testIDPrefix}-row-${logEntry.id}` : undefined}
        onPress={toggleExpanded}
        style={styles.row}
      >
        <View style={styles.metaSection}>
          {runtimeLogMeta.badges.length > 0 ? (
            <View style={styles.metaBadgesBar}>
              {runtimeLogMeta.badges.map((badge, index) => (
                <View
                  key={`${logEntry.id}-${badge.id}`}
                  style={[
                    styles.metaBadgeCell,
                    index > 0 && styles.metaBadgeCellWithDivider,
                  ]}
                >
                  <Text numberOfLines={1} style={styles.metaBadgeCellText}>
                    {badge.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text selectable style={styles.metaText}>
            {formatLogTimestamp(logEntry.timestamp)} [
            {logEntry.source.toUpperCase()}] [{logEntry.level.toUpperCase()}]
          </Text>
        </View>
        <Text
          selectable
          numberOfLines={isExpandedState ? undefined : 3}
          style={summaryStyles}
        >
          {displayedSummary}
        </Text>
        {isExpandedState ? (
          <View style={styles.detailsContainer}>
            {typeof expandedDetails === "undefined" ? (
              <Text selectable style={styles.detailsEmpty}>
                No details
              </Text>
            ) : (
              <JsonTreeView
                selectable
                mode="objectSectioned"
                value={expandedDetails}
                theme={detailsTheme}
              />
            )}
            <Text style={styles.expandHint}>tap row to collapse details ↑</Text>
          </View>
        ) : (
          <Text style={styles.expandHint}>tap row to expand details ↓</Text>
        )}
      </Pressable>
    );
  },
);

export const InAppLogViewer = ({
  logger: loggerProp,
  title = "InApp Log Viewer",
  closeLabel = "Close",
  initialFilter = "all",
  style,
  maxHeight = 420,
  theme,
  testIDPrefix,
  onExport,
  onClose,
  listMode = "virtualized",
  autoScrollToEnd = true,
}: InAppLogViewerProps) => {
  const contextLogger = useInAppLogger();
  const logger = loggerProp ?? contextLogger;

  const mergedTheme = useMemo(() => {
    return {
      ...defaultTheme,
      ...theme,
    };
  }, [theme]);
  const styles = useMemo(() => buildStyles(mergedTheme), [mergedTheme]);
  const detailsTheme = useMemo<Partial<JsonTreeViewTheme>>(() => {
    return {
      textColor: mergedTheme.mutedTextColor,
      keyColor: mergedTheme.accentColor,
      subKeyColor: mergedTheme.mutedTextColor,
      stringColor: mergedTheme.actionColor,
      numberColor: mergedTheme.apiColor,
      booleanColor: mergedTheme.warnColor,
      nullColor: mergedTheme.mutedTextColor,
      punctuationColor: mergedTheme.textColor,
      sectionBorderColor: mergedTheme.borderColor,
      sectionHeaderBackgroundColor: "rgba(255,255,255,0.04)",
      sectionBodyBackgroundColor: "rgba(0,0,0,0.22)",
      sectionHeaderTextColor: mergedTheme.accentColor,
    };
  }, [mergedTheme]);

  const [activeFilterState, setActiveFilterState] =
    useState<LogFilter>(initialFilter);
  const [searchQueryState, setSearchQueryState] = useState("");
  const runtimeLogs = useInAppLogs(activeFilterState, logger);
  const normalizedSearchQuery = useMemo(() => {
    return normalizeSearchQuery(searchQueryState);
  }, [searchQueryState]);
  const filteredRuntimeLogs = useMemo(() => {
    return runtimeLogs.filter((logEntry) => {
      return isLogEntryMatchingSearchQuery(logEntry, normalizedSearchQuery);
    });
  }, [normalizedSearchQuery, runtimeLogs]);
  const runtimeLogsListRef = useRef<FlatList<LogEntry> | null>(null);
  const runtimeLogsScrollViewRef = useRef<ScrollToEndRef | null>(null);

  const clearRuntimeLogs = useCallback(() => {
    logger.clear();
  }, [logger]);

  const exportRuntimeLogs = useCallback(() => {
    if (!onExport) {
      return;
    }

    onExport(logger.exportEntries(true), logger.getSnapshot());
  }, [logger, onExport]);

  useEffect(() => {
    if (!autoScrollToEnd) {
      return;
    }

    if (normalizedSearchQuery) {
      return;
    }

    requestAnimationFrame(() => {
      if (listMode === "virtualized") {
        runtimeLogsListRef.current?.scrollToEnd({ animated: false });
        return;
      }

      runtimeLogsScrollViewRef.current?.scrollToEnd({ animated: false });
    });
  }, [
    activeFilterState,
    autoScrollToEnd,
    listMode,
    normalizedSearchQuery,
    filteredRuntimeLogs.length,
  ]);

  const renderRuntimeLogItem = useCallback(
    (logEntry: LogEntry) => {
      return (
        <RuntimeLogRow
          key={logEntry.id}
          detailsTheme={detailsTheme}
          logEntry={logEntry}
          styles={styles}
          testIDPrefix={testIDPrefix}
        />
      );
    },
    [detailsTheme, styles, testIDPrefix],
  );

  const containerStyle =
    listMode === "static"
      ? [styles.container, { height: maxHeight }, style]
      : [styles.container, { maxHeight }, style];

  return (
    <View style={containerStyle}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerActions}>
          {onExport ? (
            <Pressable
              testID={testIDPrefix ? `${testIDPrefix}-export` : undefined}
              onPress={exportRuntimeLogs}
              style={styles.actionButton}
            >
              <Text style={styles.actionButtonText}>Export</Text>
            </Pressable>
          ) : null}
          <Pressable
            testID={testIDPrefix ? `${testIDPrefix}-clear` : undefined}
            onPress={clearRuntimeLogs}
            style={styles.actionButton}
          >
            <Text style={styles.actionButtonText}>Clear</Text>
          </Pressable>
          {onClose ? (
            <Pressable
              testID={testIDPrefix ? `${testIDPrefix}-close` : undefined}
              onPress={onClose}
              style={styles.actionButton}
            >
              <Text style={styles.actionButtonText}>{closeLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        bounces
        showsHorizontalScrollIndicator={false}
        style={styles.filterRow}
        contentContainerStyle={styles.filterRowContent}
      >
        {runtimeLogFilters.map((filter, index) => {
          const isActive = activeFilterState === filter.key;
          return (
            <Pressable
              testID={
                testIDPrefix
                  ? `${testIDPrefix}-filter-${filter.key}`
                  : undefined
              }
              key={filter.key}
              onPress={() => setActiveFilterState(filter.key)}
              style={[
                styles.filterButton,
                isActive && styles.filterButtonActive,
                index < runtimeLogFilters.length - 1 &&
                  styles.filterButtonWithSpacing,
              ]}
            >
              <Text
                style={[
                  styles.filterLabel,
                  isActive && styles.filterLabelActive,
                ]}
              >
                {filter.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.searchContainer}>
        <TextInput
          value={searchQueryState}
          onChangeText={setSearchQueryState}
          placeholder="Search logs..."
          placeholderTextColor={mergedTheme.mutedTextColor}
          style={styles.searchInput}
          testID={testIDPrefix ? `${testIDPrefix}-search-input` : undefined}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {runtimeLogs.length === 0 ? (
        <Text style={styles.empty}>No logs captured yet.</Text>
      ) : filteredRuntimeLogs.length === 0 ? (
        <Text style={styles.empty}>No logs match the current search.</Text>
      ) : listMode === "static" ? (
        <ScrollView
          ref={(value) => {
            runtimeLogsScrollViewRef.current = value as ScrollToEndRef | null;
          }}
          nestedScrollEnabled
          contentContainerStyle={styles.listContent}
          style={styles.listViewport}
        >
          {filteredRuntimeLogs.map(renderRuntimeLogItem)}
        </ScrollView>
      ) : (
        <FlatList
          ref={runtimeLogsListRef}
          data={filteredRuntimeLogs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => renderRuntimeLogItem(item)}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
};
