import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  InAppLogViewerModalButton,
  InAppLogViewer,
  createLogger,
  useInAppLogs,
} from "react-native-inapp-log-viewer";

const logger = createLogger({ enabled: true, maxEntries: 800 });

type ActionButtonTone = "default" | "danger" | "accent";

interface DemoActionButtonProps {
  label: string;
  onPress: () => void;
  tone?: ActionButtonTone;
}

const DemoActionButton = ({ label, onPress, tone }: DemoActionButtonProps) => {
  return (
    <Pressable
      style={[
        styles.actionButton,
        tone === "danger" ? styles.actionButtonDanger : null,
        tone === "accent" ? styles.actionButtonAccent : null,
      ]}
      onPress={onPress}
    >
      <Text style={styles.actionButtonLabel}>{label}</Text>
    </Pressable>
  );
};

export default function App() {
  const allLogs = useInAppLogs("all", logger);
  const apiLogs = useInAppLogs("api", logger);
  const errorLogs = useInAppLogs("error", logger);

  const [customTapCount, setCustomTapCount] = useState(0);
  const [apiRequestCount, setApiRequestCount] = useState(0);
  const customTapCountRef = useRef(0);
  const apiRequestCountRef = useRef(0);

  useEffect(() => {
    logger.log({
      source: "custom",
      level: "info",
      summary: "Example screen mounted",
      details: {
        package: "react-native-inapp-log-viewer",
        mode: "interactive-demo",
      },
    });
  }, []);

  const logCustomEvent = useCallback(() => {
    const next = customTapCountRef.current + 1;
    customTapCountRef.current = next;
    setCustomTapCount(next);
    logger.log({
      source: "custom",
      level: "info",
      summary: `Custom CTA tapped (${next})`,
      details: {
        button: "Log custom event",
        tapCount: next,
        feature: "example-buttons",
      },
    });
  }, []);

  const logActionEvent = useCallback(() => {
    logger.log({
      source: "action",
      level: "info",
      summary: "UI action: open profile sheet",
      details: {
        type: "ui/openProfileSheet",
        payload: { origin: "example-app" },
      },
    });
  }, []);

  const logApiEvent = useCallback(() => {
    const next = apiRequestCountRef.current + 1;
    apiRequestCountRef.current = next;
    setApiRequestCount(next);
    const isFailure = next % 3 === 0;
    const durationMs = 120 + (next % 5) * 45;
    logger.log({
      source: "api",
      level: isFailure ? "error" : "info",
      summary: isFailure
        ? `[ERR] GET /v1/example/${next} -> 500 (${durationMs}ms)`
        : `[RES] GET /v1/example/${next} -> 200 (${durationMs}ms)`,
      details: {
        stage: "response",
        method: "GET",
        url: `/v1/example/${next}`,
        status: isFailure ? 500 : 200,
        durationMs,
        retryable: isFailure,
      },
    });
  }, []);

  const logConsoleEvent = useCallback(() => {
    logger.log({
      source: "console",
      level: "warn",
      summary: "console.warn: cache is stale; refresh suggested",
      details: {
        args: ["cache stale", { refreshAfterSec: 15 }],
      },
    });
  }, []);

  const logErrorEvent = useCallback(() => {
    try {
      throw new Error("Example runtime error from action button");
    } catch (error) {
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      logger.log({
        source: "error",
        level: "error",
        summary: normalizedError.message,
        details: {
          name: normalizedError.name,
          stack: normalizedError.stack,
          section: "example-buttons",
        },
      });
    }
  }, []);

  const clearLogs = useCallback(() => {
    logger.clear();
    customTapCountRef.current = 0;
    apiRequestCountRef.current = 0;
    setCustomTapCount(0);
    setApiRequestCount(0);
  }, []);

  const statsLabel = useMemo(() => {
    return `${allLogs.length} total | ${apiLogs.length} api | ${errorLogs.length} errors`;
  }, [allLogs.length, apiLogs.length, errorLogs.length]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerBlock}>
          <Text style={styles.title}>react-native-inapp-log-viewer</Text>
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Live Stats</Text>
          <Text style={styles.statsValue}>{statsLabel}</Text>
          <Text style={styles.statsFootnote}>
            custom taps: {customTapCount} | api requests: {apiRequestCount}
          </Text>
        </View>

        <View style={styles.actionsBlock}>
          <Text style={styles.sectionTitle}>Action Buttons</Text>
          <View style={styles.actionsWrap}>
            <DemoActionButton
              label="Log custom event"
              onPress={logCustomEvent}
              tone="accent"
            />
            <DemoActionButton
              label="Log action event"
              onPress={logActionEvent}
            />
            <DemoActionButton label="Log API response" onPress={logApiEvent} />
            <DemoActionButton
              label="Log console warning"
              onPress={logConsoleEvent}
            />
            <DemoActionButton
              label="Log runtime error"
              onPress={logErrorEvent}
              tone="danger"
            />
            <DemoActionButton label="Clear logs" onPress={clearLogs} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Embedded Viewer</Text>
        <InAppLogViewer
          logger={logger}
          maxHeight={380}
          title="Embedded Logs"
          closeLabel="Hide"
          listMode="static"
        />
      </ScrollView>

      <InAppLogViewerModalButton
        logger={logger}
        positionPreset="right-bottom"
        viewerProps={{
          title: "Modal Logs",
          initialFilter: "all",
          maxHeight: 520,
        }}
        renderTrigger={({ open }) => {
          return (
            <Pressable onPress={open} style={styles.floatingTrigger}>
              <Text style={styles.floatingTriggerLabel}>Open Logs</Text>
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 92,
    gap: 12,
  },
  headerBlock: {
    gap: 6,
  },
  title: {
    color: "#f3f4f6",
    fontSize: 22,
    fontWeight: "800",
  },
  subtitle: {
    color: "#a3a3a3",
    fontSize: 13,
    lineHeight: 18,
  },
  statsCard: {
    backgroundColor: "#0b0b0b",
    borderColor: "#202020",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  statsTitle: {
    color: "#d1d5db",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statsValue: {
    color: "#f5f5f5",
    fontSize: 14,
    fontWeight: "700",
  },
  statsFootnote: {
    color: "#8a8a8a",
    fontSize: 12,
  },
  actionsBlock: {
    gap: 8,
  },
  sectionTitle: {
    color: "#e5e7eb",
    fontSize: 14,
    fontWeight: "700",
  },
  actionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    minWidth: 150,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2c2c2c",
    backgroundColor: "#111111",
  },
  actionButtonAccent: {
    borderColor: "#22d3ee",
    backgroundColor: "#102025",
  },
  actionButtonDanger: {
    borderColor: "#ef4444",
    backgroundColor: "#2a1010",
  },
  actionButtonLabel: {
    color: "#e5e7eb",
    fontSize: 13,
    fontWeight: "600",
  },
  floatingTrigger: {
    backgroundColor: "#171717",
    borderWidth: 1,
    borderColor: "#2f2f2f",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  floatingTriggerLabel: {
    color: "#f9fafb",
    fontWeight: "700",
    fontSize: 12,
  },
});
