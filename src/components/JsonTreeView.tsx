import React, { useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

export type JsonTreeViewMode = "flat" | "objectSectioned";

export interface JsonTreeViewTheme {
  textColor: string;
  keyColor: string;
  subKeyColor: string;
  stringColor: string;
  numberColor: string;
  booleanColor: string;
  nullColor: string;
  punctuationColor: string;
  sectionBorderColor: string;
  sectionHeaderBackgroundColor: string;
  sectionBodyBackgroundColor: string;
  sectionHeaderTextColor: string;
}

export interface JsonTreeViewProps {
  value: unknown;
  style?: StyleProp<ViewStyle>;
  mode?: JsonTreeViewMode;
  selectable?: boolean;
  theme?: Partial<JsonTreeViewTheme>;
}

type JsonTokenType =
  | "plain"
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "punctuation";

interface JsonToken {
  text: string;
  type: JsonTokenType;
}

const EMPTY_COMPLEX_VALUE_TEXT = "";
const JSON_TOKEN_REGEX =
  /"(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?=\s*:)|"(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\{|\}|\[|\]|,|:/g;

const defaultTheme: JsonTreeViewTheme = {
  textColor: "#E6EDF3",
  keyColor: "#58A6FF",
  subKeyColor: "#8B949E",
  stringColor: "#3FB950",
  numberColor: "#79C0FF",
  booleanColor: "#D29922",
  nullColor: "#8B949E",
  punctuationColor: "#E6EDF3",
  sectionBorderColor: "#30363D",
  sectionHeaderBackgroundColor: "rgba(255,255,255,0.03)",
  sectionBodyBackgroundColor: "rgba(0,0,0,0.2)",
  sectionHeaderTextColor: "#58A6FF",
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return !Array.isArray(value) && typeof value === "object" && value !== null;
};

const isArrayWithObject = (value: unknown): value is unknown[] => {
  return (
    Array.isArray(value) &&
    value.some((item) => typeof item === "object" && item !== null)
  );
};

const getInspectText = (value: unknown): string => {
  if (value === null || value === undefined || value === "") {
    return "N/A";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    const serializedValue = JSON.stringify(value);
    return typeof serializedValue === "string"
      ? serializedValue
      : String(value);
  } catch {
    return String(value);
  }
};

const isBooleanLikeValue = (value: unknown): boolean => {
  return (
    typeof value === "boolean" ||
    (typeof value === "string" && ["true", "false"].includes(value))
  );
};

const isNumberLikeValue = (value: unknown): boolean => {
  return (
    (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" &&
      value.trim().length > 0 &&
      Number.isFinite(Number(value)))
  );
};

const toDisplayValueText = (node: unknown): string => {
  const childObject = isObjectRecord(node);
  const childArrayWithObject = isArrayWithObject(node);

  if (
    node === null ||
    node === undefined ||
    childObject ||
    childArrayWithObject
  ) {
    return EMPTY_COMPLEX_VALUE_TEXT;
  }

  if (Array.isArray(node)) {
    return `[${node.map((item) => `"${String(item)}"`).join(", ")}]`;
  }

  return getInspectText(node);
};

const resolveJsonTokenType = (token: string): JsonTokenType => {
  if (token === "true" || token === "false") {
    return "boolean";
  }

  if (token === "null") {
    return "null";
  }

  if (
    token === "{" ||
    token === "}" ||
    token === "[" ||
    token === "]" ||
    token === "," ||
    token === ":"
  ) {
    return "punctuation";
  }

  if (token.startsWith('"') && token.endsWith('"')) {
    return "string";
  }

  return "number";
};

const tokenizeJsonLine = (line: string): JsonToken[] => {
  const tokens: JsonToken[] = [];
  const regex = new RegExp(JSON_TOKEN_REGEX);
  let cursor = 0;
  let match: RegExpExecArray | null = regex.exec(line);

  while (match) {
    const token = match[0];
    const tokenIndex = match.index ?? 0;

    if (tokenIndex > cursor) {
      tokens.push({
        text: line.slice(cursor, tokenIndex),
        type: "plain",
      });
    }

    const isKeyToken =
      token.startsWith('"') &&
      token.endsWith('"') &&
      line
        .slice(tokenIndex + token.length)
        .trimStart()
        .startsWith(":");

    tokens.push({
      text: token,
      type: isKeyToken ? "key" : resolveJsonTokenType(token),
    });

    cursor = tokenIndex + token.length;
    match = regex.exec(line);
  }

  if (cursor < line.length) {
    tokens.push({
      text: line.slice(cursor),
      type: "plain",
    });
  }

  return tokens.length > 0 ? tokens : [{ text: line, type: "plain" }];
};

const stringifySectionValue = (value: unknown): string => {
  if (typeof value === "undefined") {
    return "undefined";
  }

  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  try {
    const serializedValue = JSON.stringify(value, null, 2);
    if (typeof serializedValue === "string") {
      return serializedValue;
    }
  } catch {
    // no-op by design
  }

  return String(value);
};

const getSectionEntries = (
  value: unknown,
): Array<{ key: string; value: unknown }> => {
  if (isObjectRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length > 0) {
      return keys.map((key) => ({
        key,
        value: value[key],
      }));
    }
  }

  if (Array.isArray(value) && value.length > 0) {
    return value.map((item, index) => ({
      key: `[${index}]`,
      value: item,
    }));
  }

  return [{ key: "value", value }];
};

export const buildJsonTreeDebugLines = (value: unknown): string[] => {
  const lines: string[] = [];

  const appendLine = (key: string, node: unknown): void => {
    lines.push(`${key}: ${toDisplayValueText(node)}`);
  };

  const walk = (key: string, node: unknown, seen: WeakSet<object>): void => {
    if (typeof node === "object" && node !== null) {
      if (seen.has(node)) {
        lines.push(`${key}: [Circular]`);
        return;
      }
      seen.add(node);
    }

    appendLine(key, node);

    if (isObjectRecord(node)) {
      Object.keys(node).forEach((subKey) => {
        walk(subKey, node[subKey], seen);
      });
    } else if (Array.isArray(node)) {
      node.forEach((childNode, index) => {
        walk(`${key}[${index}]`, childNode, seen);
      });
    }

    if (typeof node === "object" && node !== null) {
      seen.delete(node);
    }
  };

  const seenNodes = new WeakSet<object>();

  if (isObjectRecord(value)) {
    Object.keys(value).forEach((key) => {
      walk(key, value[key], seenNodes);
    });
    return lines;
  }

  if (Array.isArray(value)) {
    value.forEach((arrayItem, index) => {
      walk(`[${index}]`, arrayItem, seenNodes);
    });
    return lines;
  }

  return [toDisplayValueText(value)];
};

const buildStyles = (theme: JsonTreeViewTheme) => {
  return StyleSheet.create({
    table: {
      flexDirection: "column",
    },
    valueText: {
      color: theme.textColor,
      fontSize: 12,
      lineHeight: 16,
    },
    tableRow: {
      flexDirection: "row",
    },
    tableSubRow: {
      paddingLeft: 5,
    },
    tableCell: {
      paddingVertical: 4,
      paddingHorizontal: 5,
      flex: 2,
      flexShrink: 1,
      fontSize: 11,
      lineHeight: 16,
    },
    tableCellKey: {
      flex: 1,
      flexShrink: 0,
      color: theme.keyColor,
    },
    tableCellSubKey: {
      color: theme.subKeyColor,
    },
    tableCellString: {
      color: theme.stringColor,
    },
    tableCellNumber: {
      color: theme.numberColor,
    },
    tableCellOther: {
      color: theme.booleanColor,
    },
    tableCellSeparator: {
      color: theme.textColor,
    },
    section: {
      borderWidth: 1,
      borderColor: theme.sectionBorderColor,
      borderRadius: 6,
      overflow: "hidden",
      marginBottom: 6,
    },
    sectionHeader: {
      backgroundColor: theme.sectionHeaderBackgroundColor,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    sectionHeaderText: {
      color: theme.sectionHeaderTextColor,
      fontSize: 11,
      fontWeight: "700",
    },
    sectionBody: {
      backgroundColor: theme.sectionBodyBackgroundColor,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    sectionLineText: {
      color: theme.textColor,
      fontSize: 11,
      lineHeight: 15,
    },
    sectionTokenPlain: {
      color: theme.textColor,
    },
    sectionTokenKey: {
      color: theme.keyColor,
    },
    sectionTokenString: {
      color: theme.stringColor,
    },
    sectionTokenNumber: {
      color: theme.numberColor,
    },
    sectionTokenBoolean: {
      color: theme.booleanColor,
    },
    sectionTokenNull: {
      color: theme.nullColor,
    },
    sectionTokenPunctuation: {
      color: theme.punctuationColor,
    },
  });
};

const resolvePrimitiveValueStyle = (
  value: unknown,
  styles: ReturnType<typeof buildStyles>,
): StyleProp<TextStyle> => {
  if (isBooleanLikeValue(value)) {
    return styles.tableCellOther;
  }

  if (isNumberLikeValue(value)) {
    return styles.tableCellNumber;
  }

  return styles.tableCellString;
};

const resolveJsonTokenStyle = (
  tokenType: JsonTokenType,
  styles: ReturnType<typeof buildStyles>,
) => {
  if (tokenType === "key") {
    return styles.sectionTokenKey;
  }

  if (tokenType === "string") {
    return styles.sectionTokenString;
  }

  if (tokenType === "number") {
    return styles.sectionTokenNumber;
  }

  if (tokenType === "boolean") {
    return styles.sectionTokenBoolean;
  }

  if (tokenType === "null") {
    return styles.sectionTokenNull;
  }

  if (tokenType === "punctuation") {
    return styles.sectionTokenPunctuation;
  }

  return styles.sectionTokenPlain;
};

export const JsonTreeView = ({
  value,
  style,
  mode = "flat",
  selectable = true,
  theme,
}: JsonTreeViewProps) => {
  const mergedTheme = useMemo(() => {
    return {
      ...defaultTheme,
      ...theme,
    };
  }, [theme]);
  const styles = useMemo(() => buildStyles(mergedTheme), [mergedTheme]);

  const renderJsonRow = (
    key: string,
    node: unknown,
    path: string,
    seenNodes: WeakSet<object>,
    isSub?: boolean,
  ): React.ReactNode => {
    const isObjectLikeNode = typeof node === "object" && node !== null;
    const isCircularNode = isObjectLikeNode && seenNodes.has(node);

    if (isObjectLikeNode && !isCircularNode) {
      seenNodes.add(node);
    }

    const childObject = !isCircularNode && isObjectRecord(node);
    const childArrayWithObject = !isCircularNode && isArrayWithObject(node);

    let rowValueContent: React.ReactNode = null;

    if (isCircularNode) {
      rowValueContent = (
        <Text
          selectable={selectable}
          style={[styles.tableCell, styles.tableCellOther]}
        >
          [Circular]
        </Text>
      );
    } else if (
      node === null ||
      node === undefined ||
      childObject ||
      childArrayWithObject
    ) {
      rowValueContent = (
        <Text selectable={selectable} style={styles.tableCell} />
      );
    } else if (Array.isArray(node)) {
      rowValueContent = (
        <Text
          selectable={selectable}
          style={[styles.tableCell, styles.tableCellString]}
        >
          <Text style={styles.tableCellSeparator}>[</Text>
          {node.map((item) => `"${String(item)}"`).join(", ")}
          <Text style={styles.tableCellSeparator}>]</Text>
        </Text>
      );
    } else {
      rowValueContent = (
        <Text
          selectable={selectable}
          style={[styles.tableCell, resolvePrimitiveValueStyle(node, styles)]}
        >
          {getInspectText(node)}
        </Text>
      );
    }

    const objectRows = childObject
      ? Object.keys(node).map((subKey) =>
          renderJsonRow(
            subKey,
            node[subKey],
            `${path}.${subKey}`,
            seenNodes,
            true,
          ),
        )
      : null;
    const arrayRows = childArrayWithObject
      ? node.map((childObjectNode, index) =>
          renderJsonRow(
            `${key}[${index}]`,
            childObjectNode,
            `${path}[${index}]`,
            seenNodes,
            true,
          ),
        )
      : null;

    if (isObjectLikeNode && !isCircularNode) {
      seenNodes.delete(node);
    }

    return (
      <React.Fragment key={path}>
        <View style={[styles.tableRow, isSub ? styles.tableSubRow : null]}>
          <Text
            selectable={selectable}
            style={[
              styles.tableCell,
              isSub ? styles.tableCellSubKey : styles.tableCellKey,
            ]}
          >
            {key}
            <Text style={styles.tableCellSeparator}>:</Text>
          </Text>
          {rowValueContent}
        </View>
        {objectRows}
        {arrayRows}
      </React.Fragment>
    );
  };

  const renderFlatJsonTreeContent = (): React.ReactNode => {
    const seenNodes = new WeakSet<object>();

    if (isObjectRecord(value)) {
      return Object.keys(value).map((key) =>
        renderJsonRow(key, value[key], key, seenNodes),
      );
    }

    if (Array.isArray(value)) {
      return value.map((arrayItem, index) =>
        renderJsonRow(`[${index}]`, arrayItem, `[${index}]`, seenNodes),
      );
    }

    return (
      <Text
        selectable={selectable}
        style={[styles.valueText, resolvePrimitiveValueStyle(value, styles)]}
      >
        {getInspectText(value)}
      </Text>
    );
  };

  const renderSectionedJsonTreeContent = (): React.ReactNode => {
    const sections = getSectionEntries(value);

    return sections.map((section, sectionIndex) => {
      const sectionText = stringifySectionValue(section.value);
      const sectionLines = sectionText.split("\n");

      return (
        <View key={`${section.key}-${sectionIndex}`} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text selectable={selectable} style={styles.sectionHeaderText}>
              {section.key}
            </Text>
          </View>
          <View style={styles.sectionBody}>
            {sectionLines.map((line, lineIndex) => {
              const tokens = tokenizeJsonLine(line);
              return (
                <Text
                  selectable={selectable}
                  key={`${section.key}-${lineIndex}`}
                  style={styles.sectionLineText}
                >
                  {tokens.map((token, tokenIndex) => (
                    <Text
                      key={`${section.key}-${lineIndex}-${tokenIndex}`}
                      style={resolveJsonTokenStyle(token.type, styles)}
                    >
                      {token.text}
                    </Text>
                  ))}
                </Text>
              );
            })}
          </View>
        </View>
      );
    });
  };

  const content =
    mode === "objectSectioned"
      ? renderSectionedJsonTreeContent()
      : renderFlatJsonTreeContent();

  return <View style={[styles.table, style]}>{content}</View>;
};

export default React.memo(JsonTreeView);
