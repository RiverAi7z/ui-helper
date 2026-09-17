import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { RecordingOptions } from "../../lib/recording-options";
import { normalizeRecordingLimit } from "../../lib/recording-limit";
import { encodeAndSaveRecording } from "../../lib/recording-client";
import { clearResizeSlot } from "./resize-layout";
import { Box, InspectorTip } from "./overlays";
import { ElementTransform } from "./element-transform";
import { buildMarkdown, sessionId } from "../../lib/feedback-markdown";
import {
  applyAnnotationEdits,
  applyStyles,
  createElementAnnotation,
  createRegionAnnotation,
  normalizeRegion,
  restoreElementState,
  styleDeltas,
  type LocalAnnotation,
} from "./annotations";
import type {
  FeedbackAnnotation,
  FeedbackSession,
  RectSnapshot,
} from "@ui-helper/shared";
import type {
  Mode,
  RecordingAsset,
  PanelState,
  PanelCommand,
} from "../../lib/panel-protocol";
import {
  STYLE_PROPERTIES,
  isInspectableElement,
  isTextEditable,
  pageSnapshot,
  rectSnapshot,
  type StyleProperty,
} from "./dom";

export function App({ host }: { host: HTMLElement }) {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
  const [annotations, setAnnotations] = useState<LocalAnnotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [regionStart, setRegionStart] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [regionCurrent, setRegionCurrent] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [recordings, setRecordings] = useState<RecordingAsset[]>([]);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(
    null,
  );
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingLimit, setRecordingLimit] = useState(20);
  const [recordBarOpen, setRecordBarOpen] = useState(false);
  const [activeRecordingScope, setActiveRecordingScope] = useState<
    "window" | "area"
  >("window");
  const [activeRecordingRegion, setActiveRecordingRegion] =
    useState<RectSnapshot>();
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [notice, setNotice] = useState("");
  const [, setLayoutTick] = useState(0);
  const annotationsRef = useRef(annotations);
  const selectedIdRef = useRef(selectedId);
  const selectionLockRef = useRef(false);
  const recordingScopeRef = useRef<"window" | "area">("window");
  const recordingRegionRef = useRef<RectSnapshot | undefined>(undefined);
  const recordingLimitRef = useRef(20);
  const editBaselineRef = useRef<{
    id: string;
    styles: LocalAnnotation["styles"];
    layoutIsolated?: boolean;
    text?: string;
    comment: string;
  } | null>(null);
  const recordingCommentBaselineRef = useRef<{
    id: string;
    comment: string;
  } | null>(null);
  annotationsRef.current = annotations;
  selectedIdRef.current = selectedId;

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    let frame = 0;
    const onLayout = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        flushSync(() => setLayoutTick((value) => value + 1));
      });
    };
    window.addEventListener("scroll", onLayout, true);
    window.addEventListener("resize", onLayout);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onLayout, true);
      window.removeEventListener("resize", onLayout);
    };
  }, []);

  useEffect(() => {
    if (!active) {
      setHovered(null);
      setRegionStart(null);
      setRegionCurrent(null);
      return;
    }

    let frame = 0;
    const onPointerMove = (event: PointerEvent) => {
      if ((mode === "region" || mode === "record-area") && regionStart) {
        setRegionCurrent({ x: event.clientX, y: event.clientY });
        return;
      }
      if (mode !== "inspect" || event.composedPath().includes(host)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.elementFromPoint(event.clientX, event.clientY);
        setHovered(
          isInspectableElement(target, host) ? target : null,
        );
      });
    };

    const onClick = (event: MouseEvent) => {
      if (
        mode !== "inspect" ||
        selectionLockRef.current ||
        event.composedPath().includes(host)
      )
        return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!isInspectableElement(target, host)) return;
      selectionLockRef.current = true;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      // DOM identity is authoritative: identical-looking siblings are separate
      // targets. Only resolve the stored selector when a framework replaced the
      // old node (including when style preview, and its observer, is disabled).
      const existing = annotationsRef.current.find((item) => {
        if (item.element === target) return true;
        if (!item.target || item.element?.isConnected) return false;
        try {
          return document.querySelector(item.target.selector) === target;
        } catch {
          return false;
        }
      });
      const annotation =
        existing ??
        createElementAnnotation(target, annotationsRef.current.length + 1);
      if (!existing) {
        setAnnotations((items) => [...items, annotation]);
      } else if (existing.element !== target) {
        if (existing.element) clearResizeSlot(existing.element);
        if (previewEnabled) {
          applyAnnotationEdits(target, existing);
        }
        setAnnotations((items) =>
          items.map((item) =>
            item.id === existing.id ? { ...item, element: target } : item,
          ),
        );
      }
      recordingCommentBaselineRef.current = null;
      setSelectedRecordingId(null);
      setSelectedId(annotation.id);
      setHovered(null);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (
        (mode !== "region" && mode !== "record-area") ||
        selectionLockRef.current ||
        event.composedPath().includes(host) ||
        event.button !== 0
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setRegionStart({ x: event.clientX, y: event.clientY });
      setRegionCurrent({ x: event.clientX, y: event.clientY });
    };

    const onPointerUp = (event: PointerEvent) => {
      if (
        (mode !== "region" && mode !== "record-area") ||
        selectionLockRef.current ||
        !regionStart ||
        event.composedPath().includes(host)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const region = normalizeRegion(regionStart, {
        x: event.clientX,
        y: event.clientY,
      });
      setRegionStart(null);
      setRegionCurrent(null);
      if (region.width < 8 || region.height < 8) return;
      if (mode === "record-area") {
        selectionLockRef.current = true;
        setMode("idle");
        void startRecording(region);
        return;
      }
      selectionLockRef.current = true;
      const annotation = createRegionAnnotation(
        region,
        annotationsRef.current.length + 1,
      );
      setAnnotations((items) => [...items, annotation]);
      setSelectedId(annotation.id);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      for (const annotation of annotationsRef.current)
        restoreElementState(annotation);
      if (recording)
        void chrome.runtime
          .sendMessage({ type: "STOP_RECORDING" })
          .catch(() => undefined);
      setAnnotations([]);
      setRecordings([]);
      setSelectedRecordingId(null);
      setRecording(false);
      setRecordingSeconds(0);
      setActiveRecordingRegion(undefined);
      setPreviewEnabled(true);
      editBaselineRef.current = null;
      recordingCommentBaselineRef.current = null;
      selectionLockRef.current = false;
      setSelectedId(null);
      setRegionStart(null);
      setRegionCurrent(null);
      setHovered(null);
      setMode("idle");
    };

    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [active, host, mode, recording, regionStart, previewEnabled]);

  useEffect(() => {
    if (!previewEnabled) return;
    const observer = new MutationObserver(() => {
      setAnnotations((items) => {
        let changed = false;
        const next = items.map((item) => {
          if (!item.target || item.element?.isConnected) return item;
          if (item.element) clearResizeSlot(item.element);
          let replacement: HTMLElement | null = null;
          try {
            replacement = document.querySelector(item.target.selector);
          } catch {
            replacement = null;
          }
          if (!(replacement instanceof HTMLElement)) return item;
          applyAnnotationEdits(replacement, item);
          changed = true;
          return { ...item, element: replacement };
        });
        return changed ? next : items;
      });
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [previewEnabled]);

  useEffect(() => {
    if (!recording) return;
    const started = Date.now() - recordingSeconds * 1000;
    const timer = window.setInterval(() => {
      const seconds = Math.min(
        recordingLimitRef.current,
        Math.floor((Date.now() - started) / 1000),
      );
      setRecordingSeconds(seconds);
      if (seconds >= recordingLimitRef.current) void stopRecording();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  const selected = annotations.find((item) => item.id === selectedId) ?? null;
  const selectedRecording =
    recordings.find((item) => item.id === selectedRecordingId) ?? null;

  useEffect(() => {
    if (!selectedId) {
      editBaselineRef.current = null;
      return;
    }
    if (editBaselineRef.current?.id === selectedId) return;
    const annotation = annotationsRef.current.find(
      (item) => item.id === selectedId,
    );
    if (annotation) {
      editBaselineRef.current = {
        id: annotation.id,
        styles: { ...annotation.styles },
        layoutIsolated: annotation.layoutIsolated,
        text: annotation.text,
        comment: annotation.comment,
      };
    }
  }, [selectedId]);

  const hoverRect = hovered?.getBoundingClientRect();
  const dragRegion =
    regionStart && regionCurrent
      ? normalizeRegion(regionStart, regionCurrent)
      : null;

  const updateAnnotation = (id: string, patch: Partial<LocalAnnotation>) => {
    setAnnotations((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const openRecordingEditor = (recordingAsset: RecordingAsset) => {
    recordingCommentBaselineRef.current = {
      id: recordingAsset.id,
      comment: recordingAsset.comment,
    };
    editBaselineRef.current = null;
    selectionLockRef.current = true;
    setSelectedId(null);
    setSelectedRecordingId(recordingAsset.id);
  };

  const updateRecordingComment = (id: string, comment: string) => {
    setRecordings((items) =>
      items.map((item) => (item.id === id ? { ...item, comment } : item)),
    );
  };

  const cancelRecordingEditor = () => {
    if (!selectedRecording) return;
    const baseline = recordingCommentBaselineRef.current;
    if (baseline?.id === selectedRecording.id)
      updateRecordingComment(selectedRecording.id, baseline.comment);
    recordingCommentBaselineRef.current = null;
    selectionLockRef.current = false;
    setSelectedRecordingId(null);
  };

  const deleteRecording = (id: string) => {
    if (recording || selectedRecording?.id !== id)
      throw new Error("Select the saved recording to delete it.");
    // Remove only this session's reference; never silently erase a saved file.
    setRecordings((items) => items.filter((item) => item.id !== id));
    recordingCommentBaselineRef.current = null;
    selectionLockRef.current = false;
    setSelectedRecordingId(null);
    setNotice("Recording removed from feedback. Local GIF kept.");
  };

  const saveRecordingComment = () => {
    if (!selectedRecording) return;
    recordingCommentBaselineRef.current = null;
    selectionLockRef.current = false;
    setSelectedRecordingId(null);
    setNotice("Recording annotation saved");
  };

  const updateStyle = (
    annotation: LocalAnnotation,
    property: StyleProperty,
    value: string,
  ) => {
    setAnnotations((items) =>
      items.map((item) => {
        if (item.id !== annotation.id) return item;
        const promoteInline =
          item.element &&
          (property.startsWith("padding-") || property.startsWith("margin-")) &&
          getComputedStyle(item.element).display === "inline";
        if (item.element && previewEnabled) {
          if (promoteInline)
            item.element.style.setProperty(
              "display",
              "inline-block",
              "important",
            );
          item.element.style.setProperty(property, value, "important");
        }
        return {
          ...item,
          styles: {
            ...item.styles,
            ...(promoteInline ? { display: "inline-block" } : {}),
            [property]: value,
          },
        };
      }),
    );
  };

  const updateText = (annotation: LocalAnnotation, value: string) => {
    setAnnotations((items) =>
      items.map((item) => {
        if (item.id !== annotation.id) return item;
        if (item.element && previewEnabled && isTextEditable(item.element))
          item.element.textContent = value;
        return { ...item, text: value };
      }),
    );
  };

  const togglePreview = () => {
    setPreviewEnabled((enabled) => {
      for (const annotation of annotationsRef.current) {
        if (!annotation.element) continue;
        if (enabled) restoreElementState(annotation);
        else applyAnnotationEdits(annotation.element, annotation);
      }
      return !enabled;
    });
  };

  const cancelEditor = () => {
    if (!selected) return;
    if (!selected.saved) {
      restoreElementState(selected);
      setAnnotations((items) =>
        items.filter((item) => item.id !== selected.id),
      );
    } else {
      const baseline = editBaselineRef.current;
      if (baseline?.id === selected.id) {
        restoreElementState(selected);
        if (selected.element && previewEnabled)
          applyAnnotationEdits(selected.element, baseline);
        updateAnnotation(selected.id, {
          styles: baseline.styles,
          layoutIsolated: baseline.layoutIsolated,
          text: baseline.text,
          comment: baseline.comment,
        });
      }
    }
    selectionLockRef.current = false;
    setSelectedId(null);
  };

  const deleteAnnotation = (annotation: LocalAnnotation) => {
    restoreElementState(annotation);
    setAnnotations((items) =>
      items.filter((item) => item.id !== annotation.id),
    );
    selectionLockRef.current = false;
    setSelectedId(null);
  };

  const saveAnnotation = (annotation: LocalAnnotation) => {
    updateAnnotation(annotation.id, { saved: true });
    editBaselineRef.current = null;
    selectionLockRef.current = false;
    setSelectedId(null);
    setNotice(`Annotation ${annotation.index} saved`);
  };

  const startRecording = async (crop?: RectSnapshot) => {
    const scope = crop ? "area" : "window";
    setNotice("");
    if (recording) return;
    const response = await chrome.runtime.sendMessage({
      type: "START_RECORDING",
      crop: {
        x: crop?.x ?? 0,
        y: crop?.y ?? 0,
        width: crop?.width ?? window.innerWidth,
        height: crop?.height ?? window.innerHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      },
    });
    if (!response?.ok) {
      selectionLockRef.current = false;
      setActiveRecordingRegion(undefined);
      setNotice(response?.error ?? "Unable to start recording");
      return;
    }
    setHovered(null);
    setSelectedRecordingId(null);
    recordingCommentBaselineRef.current = null;
    selectionLockRef.current = selectedIdRef.current !== null;
    setMode((current) => (current === "record-area" ? "idle" : current));
    recordingScopeRef.current = scope;
    recordingRegionRef.current = crop;
    setActiveRecordingScope(scope);
    setActiveRecordingRegion(crop);
    setRecordingSeconds(0);
    setRecording(true);
  };

  const stopRecording = useCallback(async () => {
    if (!recording) return;
    selectionLockRef.current = selectedIdRef.current !== null;
    const completedScope = recordingScopeRef.current;
    const completedRegion = recordingRegionRef.current;
    setRecording(false);
    setActiveRecordingRegion(undefined);
    setNotice("Encoding and saving GIF…");
    const result = await encodeAndSaveRecording(completedScope, completedRegion);
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    const recordingAsset = result.asset;
    setRecordings((items) => [...items, recordingAsset]);
    // Finishing a recording must not dismiss an element/region draft, including
    // one opened while the GIF was being encoded. Its tag can open the GIF later.
    if (!selectedIdRef.current) {
      recordingCommentBaselineRef.current = {
        id: recordingAsset.id,
        comment: "",
      };
      selectionLockRef.current = true;
      setSelectedRecordingId(recordingAsset.id);
    }
    setNotice(`GIF saved to ${recordingAsset.relativePath}`);
  }, [recording]);

  const exportForAi = () => {
    const savedAnnotations = annotations.filter((item) => item.saved);
    if (!savedAnnotations.length && !recordings.length) {
      throw new Error("Add an annotation or recording first");
    }
    const portableAnnotations: FeedbackAnnotation[] = savedAnnotations.map(
      (annotation) => ({
        id: annotation.id,
        index: annotation.index,
        kind: annotation.kind,
        comment: annotation.comment,
        target: annotation.target,
        region: annotation.region,
        styleDeltas: styleDeltas(annotation),
        artifactPaths: [],
      }),
    );
    const session: FeedbackSession = {
      version: 1,
      id: sessionId(),
      projectName: location.hostname || "local-project",
      page: pageSnapshot(),
      annotations: portableAnnotations,
      artifacts: recordings.map((recordingAsset) => ({
        kind: "gif",
        relativePath: recordingAsset.relativePath,
        mimeType: "image/gif",
        width: recordingAsset.width,
        height: recordingAsset.height,
        scope: recordingAsset.scope,
        region: recordingAsset.region,
      })),
      createdAt: new Date().toISOString(),
    };
    return buildMarkdown(session, recordings);
  };

  const completeExport = () => {
    for (const annotation of annotationsRef.current)
      restoreElementState(annotation);
    setAnnotations([]);
    setRecordings([]);
    setSelectedId(null);
    setSelectedRecordingId(null);
    editBaselineRef.current = null;
    recordingCommentBaselineRef.current = null;
    setHovered(null);
    setRegionStart(null);
    setRegionCurrent(null);
    setMode("idle");
    selectionLockRef.current = false;
    setPreviewEnabled(true);
    setNotice("Copied");
  };

  // The page owns DOM references and edits; the native panel receives only JSON.
  const panelState: PanelState = {
    mode,
    count: annotations.filter((item) => item.saved).length,
    recordings,
    selected: selected
      ? {
          id: selected.id,
          index: selected.index,
          kind: selected.kind,
          comment: selected.comment,
          target: selected.target,
          region: selected.region,
          styleDeltas: selected.styleDeltas,
          artifactPaths: selected.artifactPaths,
          styles: selected.styles,
          text: selected.text,
          saved: selected.saved,
          textEditable: !!selected.element && isTextEditable(selected.element),
        }
      : null,
    selectedRecordingId,
    recording,
    recordingSeconds,
    recordingLimit,
    previewEnabled,
    notice,
    recordBarOpen,
  };
  const panelStateRef = useRef(panelState);
  panelStateRef.current = panelState;
  const handleCommandRef = useRef<
    (command: PanelCommand) => Promise<{ text?: string }>
  >(async () => ({}));
  handleCommandRef.current = async (command) => {
    // Reject stale edits after switching the selection or navigating between tabs.
    if (
      "id" in command &&
      command.id !== selectedId &&
      command.id !== selectedRecordingId
    )
      throw new Error("The selection changed. Select the element again.");
    switch (command.type) {
      case "mode":
        setMode(command.mode);
        if (command.mode === "record-area")
          setNotice("Drag a rectangle around the area to record");
        break;
      case "preview":
        togglePreview();
        break;
      case "comment":
        if (selected) updateAnnotation(selected.id, { comment: command.value });
        break;
      case "style":
        if (selected && STYLE_PROPERTIES.includes(command.property))
          updateStyle(selected, command.property, command.value);
        break;
      case "text":
        if (selected) updateText(selected, command.value);
        break;
      case "save":
        if (selected) saveAnnotation(selected);
        break;
      case "cancel":
        cancelEditor();
        break;
      case "delete":
        if (selected) deleteAnnotation(selected);
        break;
      case "recording-comment":
        updateRecordingComment(command.id, command.value);
        break;
      case "recording-save":
        saveRecordingComment();
        break;
      case "recording-cancel":
        cancelRecordingEditor();
        break;
      case "recording-delete":
        deleteRecording(command.id);
        break;
      case "recording-limit": {
        if (recording) break;
        const limit = normalizeRecordingLimit(command.value);
        recordingLimitRef.current = limit;
        setRecordingLimit(limit);
        break;
      }
      case "record-options-toggle":
        if (!recording) setRecordBarOpen((open) => !open);
        break;
      case "record-window":
        await startRecording();
        break;
      case "record-stop":
        await stopRecording();
        break;
      case "export":
        return { text: exportForAi() };
      case "export-done":
        completeExport();
        break;
      case "dismiss-notice":
        setNotice("");
        break;
    }
    return {};
  };
  useEffect(() => {
    const listener = (
      message: { type: string; active?: boolean; command?: PanelCommand },
      _sender: chrome.runtime.MessageSender,
      respond: (value: unknown) => void,
    ) => {
      if (message.type === "PANEL_ATTACH") {
        setActive(true);
        respond({ ok: true, state: panelStateRef.current });
      } else if (message.type === "PANEL_VISIBILITY") {
        setActive(!!message.active);
        if (!message.active) {
          setMode("idle");
          setHovered(null);
          setRecordBarOpen(false);
        }
        respond({ ok: true });
      } else if (message.type === "PANEL_COMMAND" && message.command) {
        handleCommandRef.current(message.command).then(
          (result) => respond({ ok: true, ...result }),
          (error) =>
            respond({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
        );
        return true;
      }
      return false;
    };
    chrome.runtime.onMessage.addListener(listener);
    void chrome.runtime
      .sendMessage({ type: "PANEL_READY" })
      .catch(() => undefined);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);
  useEffect(() => {
    void chrome.runtime
      .sendMessage({ type: "PANEL_STATE", state: panelStateRef.current })
      .catch(() => undefined);
  }, [
    mode,
    annotations,
    selectedId,
    recordings,
    selectedRecordingId,
    recording,
    recordingSeconds,
    recordingLimit,
    previewEnabled,
    notice,
    recordBarOpen,
  ]);

  if (!active) return null;

  return (
    <div className="ui-layer">
      {recordBarOpen && !recording && (
        <RecordingOptions
          limit={recordingLimit}
          onLimit={(value) => {
            recordingLimitRef.current = value;
            setRecordingLimit(value);
          }}
          onClose={() => setRecordBarOpen(false)}
          onWindow={() => {
            setRecordBarOpen(false);
            void startRecording().catch((error) => setNotice(String(error)));
          }}
          onArea={() => {
            setRecordBarOpen(false);
            setMode("record-area");
            setNotice("Drag a rectangle around the area to record");
          }}
        />
      )}
      {hovered && hoverRect && mode === "inspect" && !selected && (
        <>
          <Box rect={rectSnapshot(hoverRect)} className="ui-hover-box" />
          <InspectorTip element={hovered} rect={hoverRect} />
        </>
      )}

      {annotations.map((annotation) => {
        const storedRect = annotation.region ?? annotation.target?.rect;
        const rect = annotation.element?.isConnected
          ? rectSnapshot(annotation.element.getBoundingClientRect())
          : storedRect
            ? {
                ...storedRect,
                x: storedRect.pageX - window.scrollX,
                y: storedRect.pageY - window.scrollY,
              }
            : undefined;
        if (!rect) return null;
        return (
          <React.Fragment key={annotation.id}>
            <Box
              rect={rect}
              className={
                annotation.kind === "region"
                  ? "ui-region-box"
                  : "ui-selected-box"
              }
            />
            {annotation.id === selectedId &&
              annotation.element?.isConnected &&
              previewEnabled && (
                <ElementTransform
                  rect={rect}
                  element={annotation.element}
                  styles={annotation.styles}
                  layoutIsolated={annotation.layoutIsolated}
                  onChange={(styles, layoutIsolated) => {
                    applyStyles(annotation.element!, styles, layoutIsolated);
                    updateAnnotation(annotation.id, {
                      styles: { ...annotation.styles, ...styles },
                      layoutIsolated,
                    });
                  }}
                  onRestore={(styles, layoutIsolated) => {
                    restoreElementState(annotation);
                    applyAnnotationEdits(annotation.element!, {
                      styles,
                      layoutIsolated,
                      text: annotation.text,
                    });
                    updateAnnotation(annotation.id, { styles, layoutIsolated });
                  }}
                />
              )}
            <button
              className="ui-marker"
              style={{
                left: rect.x + rect.width - 12,
                top:
                  rect.y -
                  (annotation.id === selectedId && annotation.element
                    ? 32
                    : 12),
              }}
              onClick={() => {
                recordingCommentBaselineRef.current = null;
                selectionLockRef.current = true;
                setSelectedRecordingId(null);
                setSelectedId(annotation.id);
              }}
            >
              {annotation.index}
            </button>
          </React.Fragment>
        );
      })}

      {!recording &&
        recordings.map((recordingAsset, index) => {
          if (!recordingAsset.region)
            return (
              <button
                className={`ui-recording-tag ui-recording-tag-button ui-recording-window-tag${
                  selectedRecordingId === recordingAsset.id ? " active" : ""
                }`}
                style={{ top: 18 + index * 34 }}
                key={recordingAsset.id}
                title="Annotate recording"
                onClick={() => openRecordingEditor(recordingAsset)}
              >
                GIF {index + 1} · Window
              </button>
            );
          const rect = {
            ...recordingAsset.region,
            x: recordingAsset.region.pageX - window.scrollX,
            y: recordingAsset.region.pageY - window.scrollY,
          };
          return (
            <React.Fragment key={recordingAsset.id}>
              <Box rect={rect} className="ui-recording-box" />
              <button
                className={`ui-recording-tag ui-recording-tag-button${
                  selectedRecordingId === recordingAsset.id ? " active" : ""
                }`}
                style={{ left: rect.x, top: Math.max(8, rect.y - 29) }}
                title="Annotate recording"
                onClick={() => openRecordingEditor(recordingAsset)}
              >
                GIF {index + 1} · Area
              </button>
            </React.Fragment>
          );
        })}

      {dragRegion && (
        <Box
          rect={dragRegion}
          className={
            mode === "record-area"
              ? "ui-recording-box ui-recording-drag"
              : "ui-region-box ui-region-drag"
          }
        />
      )}
      {recording && activeRecordingRegion && (
        <>
          <Box rect={activeRecordingRegion} className="ui-recording-box" />
          <div
            className="ui-recording-tag"
            style={{
              left: activeRecordingRegion.x,
              top: Math.max(8, activeRecordingRegion.y - 29),
            }}
          >
            REC · Area
          </div>
        </>
      )}
      {recording && activeRecordingScope === "window" && (
        <div className="ui-recording-tag ui-recording-window-tag">
          REC · Window
        </div>
      )}
    </div>
  );
}
