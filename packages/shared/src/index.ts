export type AnnotationKind = "element" | "region";

export interface RectSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
  pageX: number;
  pageY: number;
}

export interface PageSnapshot {
  url: string;
  title: string;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
  capturedAt: string;
}

export interface TargetSnapshot {
  tagName: string;
  selector: string;
  xpath: string;
  accessibleName: string;
  nearbyText: string;
  outerHTML: string;
  rect: RectSnapshot;
  computedStyles: Record<string, string>;
}

export interface StyleDelta {
  property: string;
  before: string;
  after: string;
}

export interface ArtifactRef {
  kind: "screenshot" | "crop" | "gif";
  relativePath: string;
  mimeType: string;
  width?: number;
  height?: number;
  sha256?: string;
  scope?: "window" | "area";
  region?: RectSnapshot;
}

export interface FeedbackAnnotation {
  id: string;
  index: number;
  kind: AnnotationKind;
  comment: string;
  target?: TargetSnapshot;
  region?: RectSnapshot;
  styleDeltas: StyleDelta[];
  artifactPaths: string[];
}

export interface FeedbackSession {
  version: 1;
  id: string;
  projectName: string;
  page: PageSnapshot;
  annotations: FeedbackAnnotation[];
  artifacts: ArtifactRef[];
  createdAt: string;
}

export interface RecordingCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
}

export type ExtensionRequest =
  | { type: "START_RECORDING"; crop?: RecordingCrop }
  | { type: "STOP_RECORDING" };
