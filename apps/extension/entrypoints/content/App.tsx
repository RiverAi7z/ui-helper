import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { clearResizeSlot, isolateResizeLayout } from "./resize-layout";
import type {
  FeedbackAnnotation,
  FeedbackSession,
  RectSnapshot,
  StyleDelta,
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
  snapshotElement,
  type StyleProperty,
} from "./dom";

interface OriginalStyle {
  value: string;
  priority: string;
}

interface LocalAnnotation extends FeedbackAnnotation {
  element?: HTMLElement;
  originalInline: Partial<Record<StyleProperty, OriginalStyle>>;
  styles: Partial<Record<StyleProperty, string>>;
  originalText?: string;
  text?: string;
  saved: boolean;
  layoutIsolated?: boolean;
}

type Point = { x: number; y: number };

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
          applyStyles(target, existing.styles, existing.layoutIsolated);
          if (existing.text !== undefined && isTextEditable(target))
            target.textContent = existing.text;
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
          applyStyles(replacement, item.styles, item.layoutIsolated);
          if (item.text !== undefined && isTextEditable(replacement))
            replacement.textContent = item.text;
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

  const openRecordingEditor = (
    recordingAsset: RecordingAsset,
    origin: Point,
  ) => {
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

  const restoreAnnotation = useCallback((annotation: LocalAnnotation) => {
    restoreElementState(annotation);
  }, []);

  const togglePreview = () => {
    setPreviewEnabled((enabled) => {
      for (const annotation of annotationsRef.current) {
        if (!annotation.element) continue;
        if (enabled) restoreAnnotation(annotation);
        else {
          applyStyles(
            annotation.element,
            annotation.styles,
            annotation.layoutIsolated,
          );
          if (
            annotation.text !== undefined &&
            isTextEditable(annotation.element)
          )
            annotation.element.textContent = annotation.text;
        }
      }
      return !enabled;
    });
  };

  const cancelEditor = () => {
    if (!selected) return;
    if (!selected.saved) {
      restoreAnnotation(selected);
      setAnnotations((items) =>
        items.filter((item) => item.id !== selected.id),
      );
    } else {
      const baseline = editBaselineRef.current;
      if (baseline?.id === selected.id) {
        restoreAnnotation(selected);
        if (selected.element && previewEnabled) {
          applyStyles(
            selected.element,
            baseline.styles,
            baseline.layoutIsolated,
          );
          if (baseline.text !== undefined && isTextEditable(selected.element))
            selected.element.textContent = baseline.text;
        }
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
    restoreAnnotation(annotation);
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
    const response = await chrome.runtime.sendMessage({
      type: "STOP_RECORDING",
    });
    if (!response?.ok) {
      setNotice(response?.error ?? "Unable to encode GIF");
      return;
    }
    const filename = `recording-${new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, "")
      .slice(0, 14)}-${crypto.randomUUID().slice(0, 6)}.gif`;
    const saved = await chrome.runtime.sendMessage({
      type: "PANEL_SAVE_GIF",
      dataUrl: response.dataUrl,
      filename,
    });
    if (!saved?.ok) {
      setNotice(
        saved?.error ??
          "Unable to save GIF. Keep the sidebar open while recording.",
      );
      return;
    }
    const relativePath = saved.relativePath as string;
    const recordingAsset: RecordingAsset = {
      id: crypto.randomUUID(),
      relativePath,
      width: response.width,
      height: response.height,
      frames: response.frames,
      comment: "",
      scope: completedScope,
      region: completedRegion,
    };
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
    setNotice(`GIF saved to ${relativePath}`);
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
      restoreAnnotation(annotation);
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
        const limit = Math.min(
          60,
          Math.max(1, Math.round(command.value) || 20),
        );
        recordingLimitRef.current = limit;
        setRecordingLimit(limit);
        break;
      }
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
  ]);

  if (!active) return null;

  return (
    <div className="ui-layer">
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
                    applyStyles(annotation.element!, styles, layoutIsolated);
                    if (
                      annotation.text !== undefined &&
                      isTextEditable(annotation.element!)
                    )
                      annotation.element!.textContent = annotation.text;
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
              onClick={(event) => {
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
                onClick={(event) =>
                  openRecordingEditor(recordingAsset, {
                    x: event.clientX,
                    y: event.clientY,
                  })
                }
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
                onClick={(event) =>
                  openRecordingEditor(recordingAsset, {
                    x: event.clientX,
                    y: event.clientY,
                  })
                }
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

function Box({ rect, className }: { rect: RectSnapshot; className: string }) {
  return (
    <div
      className={className}
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}

type TransformHandle =
  "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

function ElementTransform({
  rect,
  element,
  styles: savedStyles,
  layoutIsolated = false,
  onChange,
  onRestore,
}: {
  rect: RectSnapshot;
  element: HTMLElement;
  styles: LocalAnnotation["styles"];
  layoutIsolated?: boolean;
  onChange: (styles: LocalAnnotation["styles"], isolated: boolean) => void;
  onRestore: (styles: LocalAnnotation["styles"], isolated: boolean) => void;
}) {
  const gesture = useRef<{
    pointerId: number;
    x: number;
    y: number;
    handle: TransformHandle;
    width: number;
    height: number;
    left: number;
    top: number;
    scaleX: number;
    scaleY: number;
    position: string;
    isolated: boolean;
    originalIsolated: boolean;
    baseStyles: LocalAnnotation["styles"];
    original: LocalAnnotation["styles"];
  } | null>(null);

  const start = (
    event: React.PointerEvent<HTMLDivElement>,
    handle: TransformHandle,
  ) => {
    if (event.button !== 0 || gesture.current) return;
    event.preventDefault();
    event.stopPropagation();
    const baseStyles = handle === "move" ? {} : isolateResizeLayout(element);
    const computed = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    const number = (property: string) =>
      parseFloat(computed.getPropertyValue(property)) || 0;
    const borderBox = computed.boxSizing === "border-box";
    const width = parseFloat(computed.width);
    const height = parseFloat(computed.height);
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      handle,
      width: Number.isFinite(width)
        ? width
        : element.offsetWidth -
          (borderBox
            ? 0
            : number("padding-left") +
              number("padding-right") +
              number("border-left-width") +
              number("border-right-width")),
      height: Number.isFinite(height)
        ? height
        : element.offsetHeight -
          (borderBox
            ? 0
            : number("padding-top") +
              number("padding-bottom") +
              number("border-top-width") +
              number("border-bottom-width")),
      left: computed.position === "static" ? 0 : number("left"),
      top: computed.position === "static" ? 0 : number("top"),
      scaleX: Number.isFinite(width)
        ? bounds.width /
            (width +
              (borderBox
                ? 0
                : number("padding-left") +
                  number("padding-right") +
                  number("border-left-width") +
                  number("border-right-width"))) || 1
        : 1,
      scaleY: Number.isFinite(height)
        ? bounds.height /
            (height +
              (borderBox
                ? 0
                : number("padding-top") +
                  number("padding-bottom") +
                  number("border-top-width") +
                  number("border-bottom-width"))) || 1
        : 1,
      position: computed.position === "static" ? "relative" : computed.position,
      isolated: layoutIsolated || Object.keys(baseStyles).length > 0,
      originalIsolated: layoutIsolated,
      baseStyles,
      original: { ...savedStyles },
    };
    event.currentTarget
      .closest<HTMLElement>(".ui-element-transform")!
      .setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - current.x) / current.scaleX;
    const dy = (event.clientY - current.y) / current.scaleY;
    const { handle } = current;
    const styles: LocalAnnotation["styles"] = {
      ...current.baseStyles,
      position: current.position,
    };
    const px = (value: number) => `${Math.round(value * 100) / 100}px`;
    if (handle === "move") {
      styles.left = px(current.left + dx);
      styles.top = px(current.top + dy);
    } else {
      if (handle.includes("e") || handle.includes("w")) {
        const width = Math.max(
          1,
          current.width + (handle.includes("w") ? -dx : dx),
        );
        styles.width = px(width);
        if (handle.includes("w"))
          styles.left = px(current.left + current.width - width);
      }
      if (handle.includes("n") || handle.includes("s")) {
        const height = Math.max(
          1,
          current.height + (handle.includes("n") ? -dy : dy),
        );
        styles.height = px(height);
        if (handle.includes("n"))
          styles.top = px(current.top + current.height - height);
      }
    }
    onChange(styles, current.isolated);
  };
  return (
    <div
      className="ui-element-transform"
      title="Drag to move; drag handles to resize"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
      onPointerDown={(event) => start(event, "move")}
      onPointerMove={move}
      onPointerUp={(event) => {
        if (gesture.current?.pointerId !== event.pointerId) return;
        move(event);
        gesture.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        if (gesture.current)
          onRestore(gesture.current.original, gesture.current.originalIsolated);
        gesture.current = null;
      }}
      onLostPointerCapture={() => {
        if (gesture.current)
          onRestore(gesture.current.original, gesture.current.originalIsolated);
        gesture.current = null;
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const).map((handle) => (
        <div
          key={handle}
          className={`ui-transform-handle ui-transform-${handle}`}
          title={`Resize ${handle}`}
          onPointerDown={(event) => start(event, handle)}
        />
      ))}
    </div>
  );
}

function InspectorTip({
  element,
  rect,
}: {
  element: HTMLElement;
  rect: DOMRect;
}) {
  const computed = getComputedStyle(element);
  const top =
    rect.top > 95
      ? rect.top - 88
      : Math.min(window.innerHeight - 88, rect.bottom + 8);
  return (
    <div
      className="ui-inspector-tip"
      style={{
        left: Math.max(8, Math.min(window.innerWidth - 300, rect.left)),
        top,
      }}
    >
      <div>
        <strong>{element.tagName.toLowerCase()}</strong>
        <span>
          {Math.round(rect.width)}×{Math.round(rect.height)}
        </span>
      </div>
      <div>
        <span>color</span>
        <strong>{computed.color}</strong>
      </div>
      <div>
        <span>font</span>
        <strong>
          {computed.fontSize} {computed.fontFamily}
        </strong>
      </div>
    </div>
  );
}

function createElementAnnotation(
  element: HTMLElement,
  index: number,
): LocalAnnotation {
  const snapshot = snapshotElement(element);
  const originalInline: LocalAnnotation["originalInline"] = {};
  const styles: LocalAnnotation["styles"] = {};
  for (const property of STYLE_PROPERTIES) {
    originalInline[property] = {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    };
  }
  const editable = isTextEditable(element);
  return {
    id: crypto.randomUUID(),
    index,
    kind: "element",
    comment: "",
    target: snapshot,
    styleDeltas: [],
    artifactPaths: [],
    element,
    originalInline,
    styles,
    originalText: editable ? (element.textContent ?? "") : undefined,
    text: editable ? (element.textContent ?? "") : undefined,
    saved: false,
  };
}

function createRegionAnnotation(
  region: RectSnapshot,
  index: number,
): LocalAnnotation {
  return {
    id: crypto.randomUUID(),
    index,
    kind: "region",
    comment: "",
    region: {
      ...region,
      pageX: region.x + window.scrollX,
      pageY: region.y + window.scrollY,
    },
    styleDeltas: [],
    artifactPaths: [],
    originalInline: {},
    styles: {},
    saved: false,
  };
}

function normalizeRegion(
  start: { x: number; y: number },
  end: { x: number; y: number },
): RectSnapshot {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
    pageX: x + window.scrollX,
    pageY: y + window.scrollY,
  };
}

function restoreElementState(annotation: LocalAnnotation): void {
  if (!annotation.element) return;
  clearResizeSlot(annotation.element);
  for (const property of STYLE_PROPERTIES) {
    const original = annotation.originalInline[property];
    if (original?.value)
      annotation.element.style.setProperty(
        property,
        original.value,
        original.priority,
      );
    else annotation.element.style.removeProperty(property);
  }
  if (
    annotation.originalText !== undefined &&
    isTextEditable(annotation.element)
  )
    annotation.element.textContent = annotation.originalText;
}

function applyStyles(
  element: HTMLElement,
  styles: LocalAnnotation["styles"],
  layoutIsolated = false,
): void {
  if (layoutIsolated) isolateResizeLayout(element);
  Object.entries(styles).forEach(([property, value]) => {
    if (value !== undefined)
      element.style.setProperty(property, value, "important");
  });
}

function styleDeltas(annotation: LocalAnnotation): StyleDelta[] {
  const deltas: StyleDelta[] = STYLE_PROPERTIES.flatMap((property) => {
    const before = annotation.target?.computedStyles[property] ?? "";
    const after = annotation.styles[property] ?? before;
    return before.trim() === after.trim() ? [] : [{ property, before, after }];
  });
  if (annotation.layoutIsolated) {
    deltas.unshift({
      property: "layout",
      before: "normal flow",
      after:
        "Preserve the original layout footprint while resizing; the editor uses an inert layout placeholder.",
    });
  }
  if (
    annotation.originalText !== undefined &&
    annotation.text !== undefined &&
    annotation.originalText !== annotation.text
  ) {
    deltas.unshift({
      property: "textContent",
      before: annotation.originalText,
      after: annotation.text,
    });
  }
  return deltas;
}

function sessionId(): string {
  return `${new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
}

function buildMarkdown(
  session: FeedbackSession,
  recordings: RecordingAsset[],
): string {
  const lines = ["# UI feedback", "", `Page: ${session.page.url}`, ""];
  for (const annotation of session.annotations) {
    if (annotation.target) {
      lines.push(`## ${annotation.index}. \`${annotation.target.selector}\``);
      if (annotation.comment) lines.push(annotation.comment, "");

      const textDelta = annotation.styleDeltas.find(
        (delta) => delta.property === "textContent",
      );
      if (textDelta)
        lines.push(
          `Text: \`${textDelta.before}\` → \`${textDelta.after}\``,
          "",
        );

      const styleChanges = annotation.styleDeltas.filter(
        (delta) => delta.property !== "textContent",
      );
      if (styleChanges.length) {
        lines.push("```css");
        for (const delta of styleChanges)
          lines.push(`${delta.property}: ${delta.before} → ${delta.after};`);
        lines.push("```", "");
      }

      lines.push("```html", compactHtml(annotation.target.outerHTML), "```");
    } else if (annotation.region) {
      lines.push(`## ${annotation.index}. Region`);
      if (annotation.comment) lines.push(annotation.comment, "");
      lines.push(
        `Area: x=${Math.round(annotation.region.pageX)}, y=${Math.round(annotation.region.pageY)}, ${Math.round(annotation.region.width)}×${Math.round(annotation.region.height)}`,
      );
    }
    lines.push("");
  }

  recordings.forEach((recording, index) => {
    lines.push(`## Recording ${index + 1}`);
    if (recording.comment) lines.push(recording.comment, "");
    lines.push(`@${recording.relativePath}`);
    if (recording.region)
      lines.push(
        `Area: x=${Math.round(recording.region.pageX)}, y=${Math.round(recording.region.pageY)}, ${Math.round(recording.region.width)}×${Math.round(recording.region.height)}`,
      );
    lines.push("");
  });

  return lines.join("\n").trim();
}

function compactHtml(html: string): string {
  const compact = html
    .replace(/>\s+</g, "><")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (compact.length <= 800) return compact;

  const template = document.createElement("template");
  template.innerHTML = compact;
  const element = template.content.firstElementChild;
  if (!element) return `${compact.slice(0, 797)}...`;

  const shallow = element.cloneNode(false) as Element;
  const text = element.textContent?.trim().replace(/\s+/g, " ") ?? "";
  shallow.textContent = text.length > 240 ? `${text.slice(0, 237)}...` : text;
  return shallow.outerHTML;
}
