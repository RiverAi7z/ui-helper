import React, { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type {
  FeedbackAnnotation,
  FeedbackSession,
  RectSnapshot,
  StyleDelta,
} from "@ui-helper/shared";
import {
  AppWindow,
  Check,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  GripVertical,
  Link2,
  Mic,
  MousePointer2,
  Scan,
  SquareDashedMousePointer,
  StopCircle,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  STYLE_PROPERTIES,
  colorToHex,
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
}

interface RecordingAsset {
  id: string;
  relativePath: string;
  width: number;
  height: number;
  frames: number;
  comment: string;
  scope: "window" | "area";
  region?: RectSnapshot;
}

type Mode = "idle" | "inspect" | "region" | "record-area";
type DirectoryPickerWindow = Window & {
  showDirectoryPicker(options?: {
    id?: string;
    mode?: "read" | "readwrite";
  }): Promise<FileSystemDirectoryHandle>;
};

export function App({
  host,
  portalContainer,
}: {
  host: HTMLElement;
  portalContainer: HTMLElement;
}) {
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
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
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [activeRecordingScope, setActiveRecordingScope] = useState<
    "window" | "area"
  >("window");
  const [activeRecordingRegion, setActiveRecordingRegion] =
    useState<RectSnapshot>();
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [recordBarOpen, setRecordBarOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [, setLayoutTick] = useState(0);
  const annotationsRef = useRef(annotations);
  const projectDirectoryRef = useRef<FileSystemDirectoryHandle | null>(null);
  const selectedIdRef = useRef(selectedId);
  const selectionLockRef = useRef(false);
  const recordingScopeRef = useRef<"window" | "area">("window");
  const recordingRegionRef = useRef<RectSnapshot | undefined>(undefined);
  const lastSelectionRef = useRef<{ element: HTMLElement; at: number } | null>(
    null,
  );
  const editBaselineRef = useRef<{
    id: string;
    styles: LocalAnnotation["styles"];
    text?: string;
    comment: string;
  } | null>(null);
  annotationsRef.current = annotations;
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const listener = (message: { type?: string }) => {
      if (message.type === "TOGGLE_UI") setActive((value) => !value);
    };
    const shortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.shiftKey && event.code === "KeyU") {
        event.preventDefault();
        setActive((value) => !value);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    document.addEventListener("keydown", shortcut, true);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
      document.removeEventListener("keydown", shortcut, true);
    };
  }, []);

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
      setPointer({ x: event.clientX, y: event.clientY });
      if (recording) {
        setHovered(null);
        return;
      }
      if ((mode === "region" || mode === "record-area") && regionStart) {
        setRegionCurrent({ x: event.clientX, y: event.clientY });
        return;
      }
      if (mode !== "inspect" || event.composedPath().includes(host)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const target = document.elementFromPoint(event.clientX, event.clientY);
        setHovered(
          target instanceof HTMLElement && !host.contains(target)
            ? target
            : null,
        );
      });
    };

    const onClick = (event: MouseEvent) => {
      if (
        recording ||
        mode !== "inspect" ||
        selectionLockRef.current ||
        event.composedPath().includes(host)
      )
        return;
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (!(target instanceof HTMLElement)) return;
      const lastSelection = lastSelectionRef.current;
      const now = performance.now();
      if (lastSelection?.element === target && now - lastSelection.at < 350)
        return;
      lastSelectionRef.current = { element: target, at: now };
      selectionLockRef.current = true;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const annotation = createElementAnnotation(
        target,
        annotationsRef.current.length + 1,
      );
      setAnnotations((items) => [...items, annotation]);
      setSelectedId(annotation.id);
      setHovered(null);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (
        recording ||
        (mode !== "region" && mode !== "record-area") ||
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
        recording ||
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
      setRecording(false);
      setRecordingSeconds(0);
      setActiveRecordingRegion(undefined);
      setRecordBarOpen(false);
      setPreviewEnabled(true);
      editBaselineRef.current = null;
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
  }, [active, host, mode, recording, regionStart]);

  useEffect(() => {
    if (!previewEnabled) return;
    const observer = new MutationObserver(() => {
      setAnnotations((items) => {
        let changed = false;
        const next = items.map((item) => {
          if (!item.target || item.element?.isConnected) return item;
          let replacement: HTMLElement | null = null;
          try {
            replacement = document.querySelector(item.target.selector);
          } catch {
            replacement = null;
          }
          if (!(replacement instanceof HTMLElement)) return item;
          applyStyles(replacement, item.styles);
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
      const seconds = Math.min(20, Math.floor((Date.now() - started) / 1000));
      setRecordingSeconds(seconds);
      if (seconds >= 20) void stopRecording();
    }, 250);
    return () => window.clearInterval(timer);
  }, [recording]);

  const selected = annotations.find((item) => item.id === selectedId) ?? null;

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
          applyStyles(annotation.element, annotation.styles);
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
          applyStyles(selected.element, baseline.styles);
          if (baseline.text !== undefined && isTextEditable(selected.element))
            selected.element.textContent = baseline.text;
        }
        updateAnnotation(selected.id, {
          styles: baseline.styles,
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
    try {
      if (!projectDirectoryRef.current) {
        const pickerWindow = window as unknown as DirectoryPickerWindow;
        if (!pickerWindow.showDirectoryPicker)
          throw new Error(
            "This page cannot open Chromium's project folder permission dialog",
          );
        projectDirectoryRef.current = await pickerWindow.showDirectoryPicker({
          id: "ui-helper-project",
          mode: "readwrite",
        });
      }
    } catch (error) {
      selectionLockRef.current = false;
      setActiveRecordingRegion(undefined);
      if (error instanceof DOMException && error.name === "AbortError") {
        setNotice("Recording cancelled");
        return;
      }
      setNotice(error instanceof Error ? error.message : String(error));
      return;
    }
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
    setSelectedId(null);
    selectionLockRef.current = true;
    setMode("idle");
    recordingScopeRef.current = scope;
    recordingRegionRef.current = crop;
    setActiveRecordingScope(scope);
    setActiveRecordingRegion(crop);
    setRecordingSeconds(0);
    setRecording(true);
  };

  const stopRecording = useCallback(async () => {
    if (!recording) return;
    selectionLockRef.current = false;
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
    const directory = projectDirectoryRef.current;
    if (!directory) {
      setNotice("Project folder permission was lost");
      return;
    }
    let relativePath: string;
    try {
      relativePath = await saveGifToDirectory(
        directory,
        response.dataUrl,
        filename,
      );
    } catch (error) {
      projectDirectoryRef.current = null;
      setNotice(error instanceof Error ? error.message : String(error));
      return;
    }
    setRecordings((items) => [
      ...items,
      {
        id: crypto.randomUUID(),
        relativePath,
        width: response.width,
        height: response.height,
        frames: response.frames,
        comment: "",
        scope: completedScope,
        region: completedRegion,
      },
    ]);
    setNotice(`GIF saved to ${relativePath}`);
  }, [recording]);

  const exportForAi = async () => {
    const savedAnnotations = annotations.filter((item) => item.saved);
    if (!savedAnnotations.length && !recordings.length) {
      setNotice("Add an annotation or recording first");
      return;
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
    try {
      await writeClipboard(buildMarkdown(session, recordings));
      for (const annotation of annotationsRef.current)
        restoreAnnotation(annotation);
      setAnnotations([]);
      setRecordings([]);
      setSelectedId(null);
      setHovered(null);
      setRegionStart(null);
      setRegionCurrent(null);
      setMode("idle");
      selectionLockRef.current = false;
      setPreviewEnabled(true);
      setNotice("Copied");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  };

  if (!active) return null;

  return (
    <div className="ui-layer">
      {hovered && hoverRect && mode === "inspect" && !selected && (
        <>
          <Box rect={rectSnapshot(hoverRect)} className="ui-hover-box" />
          <InspectorTip element={hovered} rect={hoverRect} />
        </>
      )}

      {!recording &&
        annotations.map((annotation) => {
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
              <button
                className="ui-marker"
                style={{ left: rect.x + rect.width - 12, top: rect.y - 12 }}
                onClick={() => {
                  selectionLockRef.current = true;
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
              <div
                className="ui-recording-tag ui-recording-window-tag"
                style={{ top: 18 + index * 34 }}
                key={recordingAsset.id}
              >
                GIF {index + 1} · Window
              </div>
            );
          const rect = {
            ...recordingAsset.region,
            x: recordingAsset.region.pageX - window.scrollX,
            y: recordingAsset.region.pageY - window.scrollY,
          };
          return (
            <React.Fragment key={recordingAsset.id}>
              <Box rect={rect} className="ui-recording-box" />
              <div
                className="ui-recording-tag"
                style={{ left: rect.x, top: Math.max(8, rect.y - 29) }}
              >
                GIF {index + 1} · Area
              </div>
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
      <Toolbar
        mode={mode}
        setMode={setMode}
        count={annotations.filter((item) => item.saved).length}
        recordingCount={recordings.length}
        recording={recording}
        recordingSeconds={recordingSeconds}
        previewEnabled={previewEnabled}
        portalContainer={portalContainer}
        onTogglePreview={togglePreview}
        onStartWindow={() => startRecording()}
        onStartArea={() => {
          setMode("record-area");
          setNotice("Drag a rectangle around the area to record");
        }}
        onStopRecording={stopRecording}
        onExport={exportForAi}
        recordBarOpen={recordBarOpen}
        onToggleRecordBar={() => setRecordBarOpen((open) => !open)}
      />

      {recordBarOpen && !recording && (
        <div className="ui-record-bar">
          <button
            className="ui-record-bar-close"
            title="Close recording options"
            onClick={() => setRecordBarOpen(false)}
          >
            <X size={14} />
          </button>
          <span className="ui-record-bar-divider" />
          <button
            className="ui-record-bar-option"
            onClick={() => {
              setRecordBarOpen(false);
              startRecording();
            }}
          >
            <AppWindow size={18} />
            Window
          </button>
          <button
            className="ui-record-bar-option"
            onClick={() => {
              setRecordBarOpen(false);
              setMode("record-area");
              setNotice("Drag a rectangle around the area to record");
            }}
          >
            <Scan size={18} />
            Area
          </button>
        </div>
      )}

      {!recording && selected && (
        <Editor
          annotation={selected}
          portalContainer={portalContainer}
          onComment={(comment) => updateAnnotation(selected.id, { comment })}
          onStyle={(property, value) => updateStyle(selected, property, value)}
          onText={(value) => updateText(selected, value)}
          onCancel={cancelEditor}
          onDelete={() => deleteAnnotation(selected)}
          onSave={() => saveAnnotation(selected)}
        />
      )}

      {notice && (
        <button className="ui-notice" onClick={() => setNotice("")}>
          {notice}
          <X size={14} />
        </button>
      )}
    </div>
  );
}

function Toolbar(props: {
  mode: Mode;
  setMode: (mode: Mode) => void;
  count: number;
  recordingCount: number;
  recording: boolean;
  recordingSeconds: number;
  previewEnabled: boolean;
  portalContainer: HTMLElement;
  onTogglePreview: () => void;
  onStartWindow: () => void;
  onStartArea: () => void;
  onStopRecording: () => void;
  onExport: () => void;
  recordBarOpen: boolean;
  onToggleRecordBar: () => void;
}) {
  return (
    <div className="ui-toolbar">
      <Button
        title="Inspect elements"
        size="icon"
        disabled={props.recording}
        variant={props.mode === "inspect" ? "default" : "ghost"}
        onClick={() =>
          props.setMode(props.mode === "inspect" ? "idle" : "inspect")
        }
      >
        <MousePointer2 size={17} />
      </Button>
      <Button
        title="Annotate a region"
        size="icon"
        disabled={props.recording}
        variant={props.mode === "region" ? "default" : "ghost"}
        onClick={() =>
          props.setMode(props.mode === "region" ? "idle" : "region")
        }
      >
        <SquareDashedMousePointer size={17} />
      </Button>
      <span className="ui-divider" />
      <Button
        title={
          props.previewEnabled
            ? "Hide style-change preview"
            : "Show style-change preview"
        }
        size="icon"
        disabled={props.recording}
        variant="ghost"
        onClick={props.onTogglePreview}
      >
        {props.previewEnabled ? <Eye size={17} /> : <EyeOff size={17} />}
      </Button>
      {props.recording ? (
        <Button
          title="Stop GIF recording"
          size="icon"
          variant="destructive"
          onClick={props.onStopRecording}
        >
          <StopCircle size={17} />
        </Button>
      ) : (
        <>
          <Button
            title="Record a GIF"
            size="icon"
            variant={
              props.recordBarOpen || props.mode === "record-area"
                ? "default"
                : "ghost"
            }
            onClick={props.onToggleRecordBar}
          >
            <Video size={17} />
          </Button>
        </>
      )}
      {props.recording && (
        <span className="ui-timer">
          <i /> {props.recordingSeconds}s
        </span>
      )}
      <span className="ui-count">
        {props.count} notes · {props.recordingCount} GIF
      </span>
      <Button disabled={props.recording} onClick={props.onExport}>
        <Copy size={16} /> Copy for AI
      </Button>
    </div>
  );
}

function Editor(props: {
  annotation: LocalAnnotation;
  portalContainer: HTMLElement;
  onComment: (value: string) => void;
  onStyle: (property: StyleProperty, value: string) => void;
  onText: (value: string) => void;
  onCancel: () => void;
  onDelete: () => void;
  onSave: () => void;
}) {
  const { annotation } = props;
  const [expandedPadding, setExpandedPadding] = useState(false);
  const [expandedMargin, setExpandedMargin] = useState(false);
  const [dimensionsLinked, setDimensionsLinked] = useState(false);
  const startSpeech = () => {
    const SpeechRecognition = (
      window as unknown as {
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      }
    ).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = navigator.language;
    recognition.onresult = (event) =>
      props.onComment(
        `${annotation.comment}${annotation.comment ? " " : ""}${event.results[0][0].transcript}`,
      );
    recognition.start();
  };

  return (
    <div className="ui-editor">
      <div className="ui-editor-prompt">
        <Crosshair size={18} />
        <Textarea
          value={annotation.comment}
          onChange={(event) => props.onComment(event.target.value)}
          placeholder="Describe these changes…"
          rows={1}
        />
      </div>
      <div className="ui-editor-title">
        <span className="ui-editor-tag">
          {annotation.kind === "element"
            ? annotation.target?.tagName
            : "Region annotation"}
        </span>
        <GripVertical size={16} className="ui-drag-dots" />
      </div>
      {annotation.kind === "element" && (
        <ScrollArea className="ui-editor-scroll">
          <div className="ui-fields">
            {annotation.element && isTextEditable(annotation.element) && (
              <Field label="Text">
                <Input
                  value={annotation.text ?? ""}
                  onChange={(event) => props.onText(event.target.value)}
                />
              </Field>
            )}
            <ColorField
              label="Text color"
              value={valueOf(annotation, "color")}
              property="color"
              onChange={props.onStyle}
              portal={props.portalContainer}
            />
            <ColorField
              label="Background"
              value={valueOf(annotation, "background-color")}
              property="background-color"
              onChange={props.onStyle}
              portal={props.portalContainer}
            />
            <NumberField
              label="Opacity"
              value={valueOf(annotation, "opacity")}
              property="opacity"
              onChange={props.onStyle}
              step="0.05"
            />
            <div className="ui-section-label">Typography</div>
            <Field label="Font">
              <Select
                value={valueOf(annotation, "font-family")}
                onValueChange={(value) => props.onStyle("font-family", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent portalContainer={props.portalContainer}>
                  {[
                    valueOf(annotation, "font-family"),
                    "Inter, sans-serif",
                    "system-ui, sans-serif",
                    "Arial, sans-serif",
                    "Georgia, serif",
                    "monospace",
                  ]
                    .filter((value, index, all) => all.indexOf(value) === index)
                    .map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
            <PixelField
              label="Font size"
              value={valueOf(annotation, "font-size")}
              property="font-size"
              onChange={props.onStyle}
            />
            <Field label="Font weight">
              <Select
                value={valueOf(annotation, "font-weight")}
                onValueChange={(value) => props.onStyle("font-weight", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent portalContainer={props.portalContainer}>
                  {[
                    "100",
                    "200",
                    "300",
                    "400",
                    "500",
                    "600",
                    "700",
                    "800",
                    "900",
                  ].map((weight) => (
                    <SelectItem key={weight} value={weight}>
                      {weight}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="ui-section-label">Border</div>
            <PixelField
              label="Border radius"
              value={valueOf(annotation, "border-radius")}
              property="border-radius"
              onChange={props.onStyle}
            />
            <ColorField
              label="Border color"
              value={valueOf(annotation, "border-color")}
              property="border-color"
              onChange={props.onStyle}
              portal={props.portalContainer}
            />
            <PixelField
              label="Border width"
              value={valueOf(annotation, "border-width")}
              property="border-width"
              onChange={props.onStyle}
            />
            <div className="ui-section-label">Layout</div>
            <div className="ui-dimensions">
              <button
                className={dimensionsLinked ? "ui-link active" : "ui-link"}
                title="Lock aspect ratio"
                onClick={() => setDimensionsLinked(!dimensionsLinked)}
              >
                <Link2 size={14} />
              </button>
              <PixelField
                label="Width"
                value={valueOf(annotation, "width")}
                property="width"
                onChange={(property, value) => {
                  props.onStyle(property, value);
                  if (dimensionsLinked && annotation.target?.rect.width) {
                    props.onStyle(
                      "height",
                      `${(Number.parseFloat(value) * annotation.target.rect.height) / annotation.target.rect.width}px`,
                    );
                  }
                }}
              />
              <PixelField
                label="Height"
                value={valueOf(annotation, "height")}
                property="height"
                onChange={(property, value) => {
                  props.onStyle(property, value);
                  if (dimensionsLinked && annotation.target?.rect.height) {
                    props.onStyle(
                      "width",
                      `${(Number.parseFloat(value) * annotation.target.rect.width) / annotation.target.rect.height}px`,
                    );
                  }
                }}
              />
            </div>
            <SpacingFields
              kind="padding"
              expanded={expandedPadding}
              setExpanded={setExpandedPadding}
              annotation={annotation}
              onChange={props.onStyle}
            />
            <SpacingFields
              kind="margin"
              expanded={expandedMargin}
              setExpanded={setExpandedMargin}
              annotation={annotation}
              onChange={props.onStyle}
            />
          </div>
        </ScrollArea>
      )}
      <div className="ui-editor-actions">
        <Button
          title="Delete annotation"
          size="icon"
          variant="ghost"
          className="ui-danger-ghost"
          onClick={props.onDelete}
        >
          <Trash2 size={17} />
        </Button>
        <span className="ui-action-spacer" />
        <Button
          title="Dictate comment"
          size="icon"
          variant="ghost"
          onClick={startSpeech}
        >
          <Mic size={18} />
        </Button>
        <Button variant="secondary" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button size="icon" onClick={props.onSave}>
          <Check size={18} />
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="ui-field">
      <span>{label}</span>
      <div>{children}</div>
    </label>
  );
}

function NumberField(props: {
  label: string;
  value: string;
  property: StyleProperty;
  onChange: (property: StyleProperty, value: string) => void;
  step?: string;
}) {
  return (
    <Field label={props.label}>
      <Input
        type="number"
        step={props.step}
        value={Number.parseFloat(props.value) || 0}
        onChange={(event) => props.onChange(props.property, event.target.value)}
      />
    </Field>
  );
}

function PixelField(props: {
  label: string;
  value: string;
  property: StyleProperty;
  onChange: (property: StyleProperty, value: string) => void;
}) {
  return (
    <Field label={props.label}>
      <div className="ui-unit-input">
        <Input
          type="number"
          step="0.5"
          value={Number.parseFloat(props.value) || 0}
          onChange={(event) =>
            props.onChange(props.property, `${event.target.value}px`)
          }
        />
        <span>px</span>
      </div>
    </Field>
  );
}

function ColorField(props: {
  label: string;
  value: string;
  property: StyleProperty;
  onChange: (property: StyleProperty, value: string) => void;
  portal: HTMLElement;
}) {
  return (
    <Field label={props.label}>
      <Popover>
        <PopoverTrigger asChild>
          <button className="ui-color-trigger">
            <span style={{ background: props.value }} />
            {props.value}
          </button>
        </PopoverTrigger>
        <PopoverContent
          portalContainer={props.portal}
          align="end"
          className="ui-color-popover"
        >
          <input
            type="color"
            value={colorToHex(props.value)}
            onChange={(event) =>
              props.onChange(props.property, event.target.value)
            }
          />
          <Input
            value={props.value}
            onChange={(event) =>
              props.onChange(props.property, event.target.value)
            }
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}

function SpacingFields(props: {
  kind: "padding" | "margin";
  expanded: boolean;
  setExpanded: (value: boolean) => void;
  annotation: LocalAnnotation;
  onChange: (property: StyleProperty, value: string) => void;
}) {
  const sides = ["top", "right", "bottom", "left"] as const;
  const [linked, setLinked] = useState(false);
  const changeSide = (side: (typeof sides)[number], value: string) => {
    if (linked) {
      sides.forEach((linkedSide) =>
        props.onChange(`${props.kind}-${linkedSide}` as StyleProperty, value),
      );
    } else {
      props.onChange(`${props.kind}-${side}` as StyleProperty, value);
    }
  };
  return (
    <div className="ui-spacing">
      <div className="ui-spacing-heading">
        <button
          className="ui-spacing-toggle"
          onClick={() => props.setExpanded(!props.expanded)}
        >
          <span>{props.kind === "padding" ? "Padding" : "Margin"}</span>
          <span>{props.expanded ? "⌄" : "›"}</span>
        </button>
        <button
          className={linked ? "ui-link active" : "ui-link"}
          title={`Link ${props.kind} sides`}
          onClick={() => setLinked(!linked)}
        >
          <Link2 size={14} />
        </button>
      </div>
      {!props.expanded ? (
        <div className="ui-spacing-row">
          {sides.map((side) => {
            const property = `${props.kind}-${side}` as StyleProperty;
            return (
              <Input
                key={side}
                aria-label={`${props.kind} ${side}`}
                type="number"
                value={
                  Number.parseFloat(valueOf(props.annotation, property)) || 0
                }
                onChange={(event) =>
                  changeSide(side, `${event.target.value}px`)
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="ui-spacing-expanded">
          {sides.map((side) => {
            const property = `${props.kind}-${side}` as StyleProperty;
            return (
              <PixelField
                key={side}
                label={side[0].toUpperCase() + side.slice(1)}
                value={valueOf(props.annotation, property)}
                property={property}
                onChange={(_, value) => changeSide(side, value)}
              />
            );
          })}
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
    styles[property] = snapshot.computedStyles[property];
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

function valueOf(annotation: LocalAnnotation, property: StyleProperty): string {
  return (
    annotation.styles[property] ??
    annotation.target?.computedStyles[property] ??
    ""
  );
}

function restoreElementState(annotation: LocalAnnotation): void {
  if (!annotation.element) return;
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
): void {
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

async function saveGifToDirectory(
  project: FileSystemDirectoryHandle,
  dataUrl: string,
  filename: string,
): Promise<string> {
  const helperDirectory = await project.getDirectoryHandle(".ui-helper", {
    create: true,
  });
  const recordingsDirectory = await helperDirectory.getDirectoryHandle(
    "recordings",
    { create: true },
  );
  const ignoreFile = await helperDirectory.getFileHandle(".gitignore", {
    create: true,
  });
  const ignoreWriter = await ignoreFile.createWritable();
  await ignoreWriter.write("*\n!.gitignore\n");
  await ignoreWriter.close();

  const gifFile = await recordingsDirectory.getFileHandle(filename, {
    create: true,
  });
  const writer = await gifFile.createWritable();
  await writer.write(await (await fetch(dataUrl)).blob());
  await writer.close();
  return `.ui-helper/recordings/${filename}`;
}

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for non-secure local development origins.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.documentElement.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Unable to copy feedback to the clipboard");
}

interface SpeechRecognitionLike {
  lang: string;
  onresult: (event: {
    results: ArrayLike<{ 0: { transcript: string } }>;
  }) => void;
  start(): void;
}
