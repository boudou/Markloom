import type { MermaidConfig } from 'mermaid';
import type MermaidAPI from 'mermaid';
import type { Theme } from '@/lib/appearance';

// Mermaid (with d3, dagre, roughjs…) is the largest dependency; it loads the first time a
// document actually contains a diagram, not at startup
let loading: Promise<typeof MermaidAPI> | null = null;

/** On-screen diagrams render in the page's theme; exports always use the light palette */
export type DiagramMode = Theme | 'export';

export type DiagramRender = { ok: true; svg: string } | { ok: false; error: string };

// The mode Mermaid is initialized for. Only queued tasks may change it, so a switch can't
// land in the middle of another render.
let activeMode: DiagramMode = 'light';

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

// Light palette, shared by the light preview and exports
const LIGHT_THEME_VARIABLES = {
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
};

// Dark palette on the app's dark surfaces. Every label reaches 4.5:1 and every pie, gantt and
// xyChart fill 3:1 against the background. Mermaid darkens unset cScale colours in dark mode
// and keeps light literals for unset gantt colours, so all of them are set here.
const DARK_THEME_VARIABLES = {
  darkMode: true,
  background: '#1E2024',
  primaryColor: '#26292E',
  primaryTextColor: '#E8EAED',
  primaryBorderColor: '#6EA8FE',
  lineColor: '#9CA3AF',
  secondaryColor: '#2C3036',
  tertiaryColor: '#33373D',
  fontFamily: LIGHT_THEME_VARIABLES.fontFamily,
  fontSize: LIGHT_THEME_VARIABLES.fontSize,
  textColor: '#E8EAED',
  mainBkg: '#26292E',
  nodeBorder: '#6EA8FE',
  clusterBkg: '#17191C',
  clusterBorder: '#6EA8FE',
  titleColor: '#E8EAED',
  edgeLabelBackground: '#1E2024',
  // Flowchart specific
  nodeTextColor: '#E8EAED',
  // Sequence diagram specific
  actorTextColor: '#E8EAED',
  actorBkg: '#26292E',
  actorBorder: '#6EA8FE',
  actorLineColor: '#9CA3AF',
  signalColor: '#E8EAED',
  signalTextColor: '#E8EAED',
  labelBoxBkgColor: '#26292E',
  labelBoxBorderColor: '#6EA8FE',
  labelTextColor: '#E8EAED',
  loopTextColor: '#E8EAED',
  noteBkgColor: '#3D3420',
  noteTextColor: '#E8EAED',
  noteBorderColor: '#D29922',
  activationBkgColor: '#2C3036',
  activationBorderColor: '#6EA8FE',
  // State, class and ER diagrams
  labelColor: '#E8EAED',
  stateBkg: '#26292E',
  stateLabelColor: '#E8EAED',
  compositeBackground: '#1E2024',
  compositeTitleBackground: '#26292E',
  classText: '#E8EAED',
  attributeBackgroundColorOdd: '#26292E',
  attributeBackgroundColorEven: '#1E2024',
  // Pie chart: opaque slices (the default 0.7 blends them into the background)
  pie1: '#60A5FA',
  pie2: '#4ADE80',
  pie3: '#FBBF24',
  pie4: '#F87171',
  pie5: '#A78BFA',
  pie6: '#2DD4BF',
  pie7: '#FB923C',
  pie8: '#818CF8',
  pie9: '#F472B6',
  pie10: '#22D3EE',
  pie11: '#A3E635',
  pie12: '#C084FC',
  pieOpacity: '1',
  pieStrokeColor: '#1E2024',
  pieStrokeWidth: '2px',
  pieOuterStrokeColor: '#4A4F57',
  pieOuterStrokeWidth: '1px',
  pieSectionTextColor: '#1A1A1A',
  pieTitleTextColor: '#E8EAED',
  pieLegendTextColor: '#E8EAED',
  // Gantt
  taskBkgColor: '#60A5FA',
  taskBorderColor: '#93C5FD',
  activeTaskBkgColor: '#93C5FD',
  activeTaskBorderColor: '#6EA8FE',
  doneTaskBkgColor: '#4ADE80',
  doneTaskBorderColor: '#22C55E',
  critBkgColor: '#F87171',
  critBorderColor: '#EF4444',
  taskTextColor: '#1A1A1A',
  taskTextDarkColor: '#1A1A1A',
  taskTextLightColor: '#1A1A1A',
  taskTextOutsideColor: '#E8EAED',
  taskTextClickableColor: '#6EA8FE',
  gridColor: '#33373D',
  todayLineColor: '#F87171',
  sectionBkgColor: '#26292E',
  sectionBkgColor2: '#2C3036',
  altSectionBkgColor: '#1E2024',
  excludeBkgColor: '#2C3036',
  vertLineColor: '#9CA3AF',
  // Mindmap and timeline (the mindmap root uses git0 and gitBranchLabel0)
  cScale0: '#1E40AF',
  cScale1: '#5B21B6',
  cScale2: '#166534',
  cScale3: '#92400E',
  cScale4: '#991B1B',
  cScale5: '#115E59',
  cScale6: '#9A3412',
  cScale7: '#3730A3',
  cScale8: '#9D174D',
  cScale9: '#155E75',
  cScale10: '#3F6212',
  cScale11: '#6B21A8',
  cScaleLabel0: '#E8EAED',
  cScaleLabel1: '#E8EAED',
  cScaleLabel2: '#E8EAED',
  cScaleLabel3: '#E8EAED',
  cScaleLabel4: '#E8EAED',
  cScaleLabel5: '#E8EAED',
  cScaleLabel6: '#E8EAED',
  cScaleLabel7: '#E8EAED',
  cScaleLabel8: '#E8EAED',
  cScaleLabel9: '#E8EAED',
  cScaleLabel10: '#E8EAED',
  cScaleLabel11: '#E8EAED',
  git0: '#1E40AF',
  gitBranchLabel0: '#E8EAED',
  mindmapBackground: '#1E2024',
  // Quadrant
  quadrant1Fill: '#14532D',
  quadrant2Fill: '#1E3A8A',
  quadrant3Fill: '#7F1D1D',
  quadrant4Fill: '#78350F',
  quadrant1TextFill: '#BBF7D0',
  quadrant2TextFill: '#BFDBFE',
  quadrant3TextFill: '#FECACA',
  quadrant4TextFill: '#FDE68A',
  quadrantPointFill: '#6EA8FE',
  quadrantPointTextFill: '#E8EAED',
  quadrantXAxisTextFill: '#E8EAED',
  quadrantYAxisTextFill: '#E8EAED',
  // XY Chart
  xyChart: {
    backgroundColor: '#1E2024',
    titleColor: '#E8EAED',
    xAxisTitleColor: '#E8EAED',
    yAxisTitleColor: '#E8EAED',
    xAxisLabelColor: '#E8EAED',
    yAxisLabelColor: '#E8EAED',
    xAxisLineColor: '#4A4F57',
    yAxisLineColor: '#4A4F57',
    plotColorPalette: '#60A5FA,#4ADE80,#FBBF24,#F87171,#A78BFA',
  },
};

function buildConfig(theme: Theme): ExtendedMermaidConfig {
  return {
    startOnLoad: false,
    theme: 'base',
    // Strict: diagram text can't inject HTML or click handlers (documents may be untrusted)
    securityLevel: 'strict',
    themeVariables: theme === 'dark' ? DARK_THEME_VARIABLES : LIGHT_THEME_VARIABLES,
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
// Word and canvas can't draw) and real pixel sizes instead of width="100%". Always light,
// whatever the page's theme: an exported document is read on paper or a light page.
function buildExportConfig(): ExtendedMermaidConfig {
  const config = buildConfig('light');
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
  return mode === 'export' ? buildExportConfig() : buildConfig(mode);
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

// Every surface (preview, rich text, .mmd editor, export) shares these results, so an editor
// mode switch, a theme toggle back or an unrelated edit reuses diagrams already drawn, errors
// included
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

const MODES: readonly DiagramMode[] = ['light', 'dark', 'export'];

/** Drops every cached result of this source so the next render draws it again (manual refresh). */
export function forgetDiagram(code: string): void {
  MODES.forEach((mode) => rendered.delete(cacheKey(code, mode)));
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
