import { selectActiveTab, selectTabContent, useTabsStore } from '@/features/tabs';

const TOUR_ID = 'tour';

/** `?sample` on the address opens the tour: the website's "Try the sample" links there */
const SAMPLE_PARAM = 'sample';

/** Opens the tour in a new tab, replacing the blank tab the app starts with so it is the only one */
export async function openSample(): Promise<void> {
  const { builtInTemplates, processTemplate } = await import('./utils/builtInTemplates');
  const tour = builtInTemplates.find((template) => template.id === TOUR_ID);

  if (!tour) throw new Error(`Template missing: ${TOUR_ID}`);

  const state = useTabsStore.getState();
  const startTab = selectActiveTab(state);
  const blank = startTab && !startTab.path && !startTab.isDirty && selectTabContent(state, startTab.id) === '' ? startTab : undefined;

  state.createTab(null, processTemplate(tour.content), tour.name);

  if (blank) state.closeTabs([blank.id]);
}

/** Opens the tour if the address asks for it, and takes the request off the address so a reload doesn't repeat it */
export function openSampleFromAddress(): void {
  const url = new URL(window.location.href);

  if (!url.searchParams.has(SAMPLE_PARAM)) return;

  url.searchParams.delete(SAMPLE_PARAM);
  window.history.replaceState(null, '', url);
  void openSample();
}
