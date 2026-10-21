import type { MermaidConfig } from 'mermaid';
import type MermaidAPI from 'mermaid';

// Mermaid (with d3, dagre, roughjs…) is the largest dependency; it loads the first time a
// document actually contains a diagram, not at startup
let loading: Promise<typeof MermaidAPI> | null = null;

export type DiagramMode = 'preview' | 'export';

export type DiagramRender = { ok: true; svg: string } | { ok: false; error: string };

// The mode Mermaid is initialized for. Only queued tasks may change it, so a switch can't
// land in the middle of another render.
let activeMode: DiagramMode = 'preview';

function loadMermaid(): Promise<typeof MermaidAPI> {
  loading ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize(configFor(activeMode));

    return mermaid;
  });

  return loading;
}

// Extended mermaid config type to include newer diagram configs
type ExtendedMermaidConfig = MermaidConfig & {
  stateDiagram?: { useMaxWidth?: boolean };
  er?: { useMaxWidth?: boolean };
  pie?: { useMaxWidth?: boolean };
  mindmap?: { useMaxWidth?: boolean; padding?: number };
};

// Light theme shared by the preview and exports
function buildConfig(): ExtendedMermaidConfig {
  return {
    startOnLoad: false,
    theme: 'base',
    // Strict: diagram text can't inject HTML or click handlers (documents may be untrusted)
    securityLevel: 'strict',
    themeVariables: {
      darkMode: false,
      background: '#FFFFFF',
      primaryColor: '#DBEAFE',
      primaryTextColor: '#1E293B',
      primaryBorderColor: '#3B82F6',
      lineColor: '#64748B',
      secondaryColor: '#F1F5F9',
      tertiaryColor: '#E2E8F0',
      // The app's UI face, so diagrams read as part of Markloom (exports fall back to system sans)
      fontFamily: 'Outfit, "Segoe UI", system-ui, sans-serif',
      fontSize: '14px',
      textColor: '#1E293B',
      mainBkg: '#FFFFFF',
      nodeBorder: '#3B82F6',
      clusterBkg: '#F8FAFC',
      clusterBorder: '#3B82F6',
      titleColor: '#1E293B',
      edgeLabelBackground: '#FFFFFF',
      // Flowchart specific
      nodeTextColor: '#1E293B',
      // Sequence diagram specific
      actorTextColor: '#1E293B',
      actorBkg: '#DBEAFE',
      actorBorder: '#3B82F6',
      signalColor: '#1E293B',
      signalTextColor: '#1E293B',
      noteBkgColor: '#FEF9C3',
      noteTextColor: '#1E293B',
      noteBorderColor: '#EAB308',
      activationBkgColor: '#DBEAFE',
      activationBorderColor: '#3B82F6',
      // State diagram
      labelColor: '#1E293B',
      stateBkg: '#DBEAFE',
      stateLabelColor: '#1E293B',
      // Class diagram
      classText: '#1E293B',
      // ER diagram
      attributeBackgroundColorOdd: '#F8FAFC',
      attributeBackgroundColorEven: '#FFFFFF',
      // Pie chart
      pie1: '#3B82F6',
      pie2: '#22C55E',
      pie3: '#F59E0B',
      pie4: '#EF4444',
      pie5: '#8B5CF6',
      pie6: '#14B8A6',
      pie7: '#F97316',
      pie8: '#6366F1',
      pie9: '#EC4899',
      pie10: '#06B6D4',
      pie11: '#84CC16',
      pie12: '#A855F7',
      pieStrokeColor: '#FFFFFF',
      pieStrokeWidth: '2px',
      pieTitleTextColor: '#1E293B',
      pieLegendTextColor: '#1E293B',
      pieOuterStrokeWidth: '1px',
      // Gantt
      taskTextColor: '#1E293B',
      taskTextOutsideColor: '#1E293B',
      gridColor: '#E2E8F0',
      doneTaskBkgColor: '#22C55E',
      activeTaskBkgColor: '#3B82F6',
      critBkgColor: '#EF4444',
      todayLineColor: '#EF4444',
      // Timeline
      cScale0: '#3B82F6',
      cScale1: '#8B5CF6',
      cScale2: '#22C55E',
      cScale3: '#F59E0B',
      cScale4: '#EF4444',
      cScaleLabel0: '#1E293B',
      cScaleLabel1: '#1E293B',
      cScaleLabel2: '#1E293B',
      // Mindmap
      mindmapBackground: '#FFFFFF',
      // Quadrant
      quadrant1Fill: '#DCFCE7',
      quadrant2Fill: '#DBEAFE',
      quadrant3Fill: '#FEE2E2',
      quadrant4Fill: '#FEF3C7',
      quadrant1TextFill: '#166534',
      quadrant2TextFill: '#1E40AF',
      quadrant3TextFill: '#991B1B',
      quadrant4TextFill: '#92400E',
      quadrantPointFill: '#3B82F6',
      quadrantPointTextFill: '#1E293B',
      quadrantXAxisTextFill: '#1E293B',
      quadrantYAxisTextFill: '#1E293B',
      // XY Chart
      xyChart: {
        backgroundColor: '#FFFFFF',
        titleColor: '#1E293B',
        xAxisTitleColor: '#1E293B',
        yAxisTitleColor: '#1E293B',
        xAxisLabelColor: '#1E293B',
        yAxisLabelColor: '#1E293B',
        xAxisLineColor: '#E2E8F0',
        yAxisLineColor: '#E2E8F0',
        plotColorPalette: '#3B82F6,#22C55E,#F59E0B,#EF4444,#8B5CF6',
      },
    },
    flowchart: {
      htmlLabels: true,
      curve: 'basis',
      padding: 15,
      useMaxWidth: true,
    },
    sequence: {
      diagramMarginX: 50,
      diagramMarginY: 10,
      actorMargin: 50,
      width: 150,
      height: 65,
      boxMargin: 10,
      boxTextMargin: 5,
      noteMargin: 10,
      messageMargin: 35,
      mirrorActors: false,
      useMaxWidth: true,
    },
    gantt: {
      titleTopMargin: 25,
      barHeight: 20,
      barGap: 4,
      topPadding: 50,
      leftPadding: 75,
      gridLineStartPadding: 35,
      fontSize: 11,
      useMaxWidth: true,
    },
    stateDiagram: {
      useMaxWidth: true,
    },
    er: {
      useMaxWidth: true,
    },
    pie: {
      useMaxWidth: true,
    },
    mindmap: {
      useMaxWidth: true,
      padding: 16,
    },
  };
}

// Exports need self-contained SVG: plain <text> labels (no HTML inside foreignObject, which
// Word and canvas can't draw) and real pixel sizes instead of width="100%".
function buildExportConfig(): ExtendedMermaidConfig {
  const config = buildConfig();
  const fixed = { useMaxWidth: false };

  return {
    ...config,
    htmlLabels: false,
    flowchart: { ...config.flowchart, ...fixed, htmlLabels: false },
    sequence: { ...config.sequence, ...fixed },
    gantt: { ...config.gantt, ...fixed },
    stateDiagram: { ...fixed },
    er: { ...fixed },
    pie: { ...fixed },
    mindmap: { ...config.mindmap, ...fixed },
  };
}

function configFor(mode: DiagramMode): ExtendedMermaidConfig {
  return mode === 'export' ? buildExportConfig() : buildConfig();
}

// Mermaid keeps global state, so renders run one at a time
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task);
  queue = run.catch(() => undefined);

  return run;
}

function removeRenderLeftovers(id: string) {
  // A failed render can leave its scratch element or an error graphic in <body>
  document.getElementById(id)?.remove();
  document.getElementById(`d${id}`)?.remove();
}

// Every surface (preview, rich text, .mmd editor, export) shares these results, so a mode
// switch or an unrelated edit reuses diagrams already drawn, errors included
const MAX_CACHED_DIAGRAMS = 100;

const rendered = new Map<string, Promise<DiagramRender>>();

let renderCount = 0;

async function draw(code: string, mode: DiagramMode): Promise<DiagramRender> {
  // Uppercase because heading ids are lowercase slugs, and Mermaid removes any element that
  // already has the render id
  const id = `Mermaid-${++renderCount}`;

  try {
    const mermaid = await loadMermaid();

    if (mode !== activeMode) {
      mermaid.initialize(configFor(mode));
      activeMode = mode;
    }

    const { svg } = await mermaid.render(id, code);

    return { ok: true, svg };
  } catch (error) {
    removeRenderLeftovers(id);

    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function cacheKey(code: string, mode: DiagramMode): string {
  return `${mode}\n${code}`;
}

/** Drops a cached result so the next render of this source draws it again (manual refresh). */
export function forgetDiagram(code: string, mode: DiagramMode): void {
  rendered.delete(cacheKey(code, mode));
}

/** Renders a diagram (cached by mode and exact source); never rejects. */
export function renderMermaid(code: string, mode: DiagramMode): Promise<DiagramRender> {
  const key = cacheKey(code, mode);
  const hit = rendered.get(key);

  if (hit) {
    // Re-insert so the map stays in least-recently-used order
    rendered.delete(key);
    rendered.set(key, hit);

    return hit;
  }

  const result = enqueue(() => draw(code, mode));
  rendered.set(key, result);

  if (rendered.size > MAX_CACHED_DIAGRAMS) {
    const oldest = rendered.keys().next();

    if (!oldest.done) rendered.delete(oldest.value);
  }

  return result;
}

/** Checks diagram syntax without drawing it; returns the error message, or null when valid. */
export function diagramSyntaxError(code: string): Promise<string | null> {
  return enqueue(async () => {
    try {
      await (await loadMermaid()).parse(code);

      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  });
}
