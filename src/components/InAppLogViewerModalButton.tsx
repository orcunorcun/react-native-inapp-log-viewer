import React, { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { useInAppLogger } from "../hooks/loggerContext";
import type { InAppLogger } from "../types";
import { InAppLogViewer, type InAppLogViewerProps } from "./InAppLogViewer";

export type InAppLogViewerModalButtonPositionPreset =
  | "right-bottom"
  | "right-center"
  | "left-bottom"
  | "left-center";

export interface InAppLogViewerModalButtonRenderTriggerProps {
  isVisible: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  defaultTrigger: React.ReactElement;
}

export interface InAppLogViewerModalButtonProps {
  logger?: InAppLogger;
  positionPreset?: InAppLogViewerModalButtonPositionPreset;
  triggerContainerStyle?: StyleProp<ViewStyle>;
  triggerStyle?: StyleProp<ViewStyle>;
  triggerTextStyle?: StyleProp<TextStyle>;
  renderTrigger?: (
    props: InAppLogViewerModalButtonRenderTriggerProps,
  ) => React.ReactNode;
  viewerProps?: Omit<InAppLogViewerProps, "logger">;
  title?: string;
  closeLabel?: string;
  modalCardStyle?: StyleProp<ViewStyle>;
  overlayColor?: string;
  visible?: boolean;
  defaultVisible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  closeOnBackdropPress?: boolean;
  testIDPrefix?: string;
}

const DEFAULT_POSITION_PRESET: InAppLogViewerModalButtonPositionPreset =
  "right-bottom";
const DEFAULT_TITLE = "InApp Log Viewer";
const DEFAULT_CLOSE_LABEL = "Close";
const DEFAULT_OVERLAY_COLOR = "rgba(0,0,0,0.45)";
const DEFAULT_TRIGGER_WIDTH = 10;
const DEFAULT_TRIGGER_HEIGHT = 50;
const DEFAULT_TRIGGER_HIT_SLOP = {
  top: 14,
  bottom: 14,
  left: 18,
  right: 8,
};

export const resolveModalButtonPresetStyle = (
  preset: InAppLogViewerModalButtonPositionPreset,
): ViewStyle => {
  if (preset === "right-center") {
    return {
      right: 0,
      top: "50%",
      transform: [{ translateY: -Math.round(DEFAULT_TRIGGER_HEIGHT / 2) }],
    };
  }

  if (preset === "left-bottom") {
    return {
      left: 0,
      bottom: 20,
    };
  }

  if (preset === "left-center") {
    return {
      left: 0,
      top: "50%",
      transform: [{ translateY: -Math.round(DEFAULT_TRIGGER_HEIGHT / 2) }],
    };
  }

  return {
    right: 0,
    bottom: 20,
  };
};

export const shouldUseFloatingTriggerContainer = ({
  hasCustomTrigger,
  hasTriggerContainerStyle,
  hasPositionPreset,
}: {
  hasCustomTrigger: boolean;
  hasTriggerContainerStyle: boolean;
  hasPositionPreset: boolean;
}): boolean => {
  return !hasCustomTrigger || hasTriggerContainerStyle || hasPositionPreset;
};

const resolveTriggerSide = (
  preset: InAppLogViewerModalButtonPositionPreset,
): "left" | "right" => {
  return preset.startsWith("left") ? "left" : "right";
};

export const InAppLogViewerModalButton = ({
  logger: loggerProp,
  positionPreset,
  triggerContainerStyle,
  triggerStyle,
  triggerTextStyle,
  renderTrigger,
  viewerProps,
  title = DEFAULT_TITLE,
  closeLabel = DEFAULT_CLOSE_LABEL,
  modalCardStyle,
  overlayColor = DEFAULT_OVERLAY_COLOR,
  visible,
  defaultVisible = false,
  onVisibleChange,
  closeOnBackdropPress = true,
  testIDPrefix,
}: InAppLogViewerModalButtonProps) => {
  const contextLogger = useInAppLogger();
  const logger = loggerProp ?? contextLogger;
  const [internalVisibleState, setInternalVisibleState] =
    useState(defaultVisible);

  const isControlled = typeof visible === "boolean";
  const isVisible = isControlled ? Boolean(visible) : internalVisibleState;

  const setVisible = useCallback(
    (nextVisible: boolean) => {
      if (!isControlled) {
        setInternalVisibleState(nextVisible);
      }

      onVisibleChange?.(nextVisible);
    },
    [isControlled, onVisibleChange],
  );

  const openModal = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  const closeModal = useCallback(() => {
    setVisible(false);
  }, [setVisible]);

  const toggleModal = useCallback(() => {
    setVisible(!isVisible);
  }, [isVisible, setVisible]);

  const hasCustomTrigger = Boolean(renderTrigger);
  const hasTriggerContainerStyle = typeof triggerContainerStyle !== "undefined";
  const hasPositionPreset = typeof positionPreset !== "undefined";
  const shouldRenderFloatingContainer = shouldUseFloatingTriggerContainer({
    hasCustomTrigger,
    hasTriggerContainerStyle,
    hasPositionPreset,
  });
  const effectivePositionPreset = positionPreset ?? DEFAULT_POSITION_PRESET;

  const presetStyle = useMemo(() => {
    return resolveModalButtonPresetStyle(effectivePositionPreset);
  }, [effectivePositionPreset]);

  const triggerSide = useMemo(() => {
    return resolveTriggerSide(effectivePositionPreset);
  }, [effectivePositionPreset]);

  const defaultTrigger = useMemo(() => {
    return (
      <Pressable
        testID={testIDPrefix ? `${testIDPrefix}-trigger` : undefined}
        onPress={openModal}
        hitSlop={DEFAULT_TRIGGER_HIT_SLOP}
        style={[
          styles.defaultTrigger,
          triggerSide === "right"
            ? styles.defaultTriggerRight
            : styles.defaultTriggerLeft,
          triggerStyle,
        ]}
      >
        <Text style={[styles.defaultTriggerText, triggerTextStyle]}>LOGS</Text>
      </Pressable>
    );
  }, [openModal, testIDPrefix, triggerSide, triggerStyle, triggerTextStyle]);

  const renderedTrigger = renderTrigger
    ? renderTrigger({
        isVisible,
        open: openModal,
        close: closeModal,
        toggle: toggleModal,
        defaultTrigger,
      })
    : defaultTrigger;

  const viewerStyle = useMemo(() => {
    return [styles.viewer, viewerProps?.style];
  }, [viewerProps?.style]);

  return (
    <>
      {shouldRenderFloatingContainer ? (
        <View
          pointerEvents="box-none"
          style={[styles.triggerContainer, presetStyle, triggerContainerStyle]}
        >
          {renderedTrigger}
        </View>
      ) : (
        renderedTrigger
      )}

      <Modal
        transparent
        animationType="fade"
        visible={isVisible}
        onRequestClose={closeModal}
        statusBarTranslucent
        testID={testIDPrefix ? `${testIDPrefix}-modal` : undefined}
      >
        <View style={[styles.overlay, { backgroundColor: overlayColor }]}>
          <Pressable
            testID={testIDPrefix ? `${testIDPrefix}-backdrop` : undefined}
            style={StyleSheet.absoluteFill}
            onPress={closeOnBackdropPress ? closeModal : undefined}
          />

          <View style={[styles.modalCard, modalCardStyle]}>
            <InAppLogViewer
              logger={logger}
              {...viewerProps}
              style={viewerStyle}
              title={viewerProps?.title ?? title}
              onClose={closeModal}
              closeLabel={closeLabel}
              testIDPrefix={
                viewerProps?.testIDPrefix ??
                (testIDPrefix ? `${testIDPrefix}-viewer` : undefined)
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  triggerContainer: {
    position: "absolute",
    zIndex: 9999,
    elevation: 9999,
  },
  defaultTrigger: {
    width: DEFAULT_TRIGGER_WIDTH,
    height: DEFAULT_TRIGGER_HEIGHT,
    backgroundColor: "#2D2D2D",
    alignItems: "center",
    justifyContent: "center",
  },
  defaultTriggerRight: {
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  defaultTriggerLeft: {
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
  },
  defaultTriggerText: {
    color: "#FFFFFF",
    fontSize: 8,
    fontWeight: "700",
    textAlign: "center",
    transform: [{ rotate: "-90deg" }],
  },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 640,
    maxHeight: "90%",
    backgroundColor: "transparent",
  },
  viewer: {
    maxHeight: 520,
  },
});
