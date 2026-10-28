import { useMemo, useState } from 'react';
import { Clock, FileText, Type, AlignLeft, BookOpen, Mic, Target, Check } from 'lucide-react';
import { Button, Input, Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useActiveContent, useTabsStore } from '@/features/tabs';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWordCount } from '../hooks';
import { useSelectedText } from '../stores/selection';
import { calculateTextStats, countText, readingMinutes, formatReadingTime, formatNumber } from '../utils';

const plural = (n: number, word: string) => `${formatNumber(n)} ${n === 1 ? word : `${word}s`}`;

/** The key a document's word goal is stored under: its path, or its tab while unsaved */
function useGoalKey(): string | null {
  return useTabsStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeTabId);

    return tab ? (tab.path ?? tab.id) : null;
  });
}

export function WordCountWidget() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const count = useWordCount();
  const selectedText = useSelectedText((s) => s.text);
  const selection = useMemo(() => (selectedText ? countText(selectedText) : null), [selectedText]);
  const goalKey = useGoalKey();
  const goal = useSettingsStore((s) => (goalKey ? s.wordGoals[goalKey] : undefined));

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={cn(
          'flex items-center gap-3 text-text-muted',
          'hover:text-text-secondary transition-colors cursor-pointer',
          'focus:outline-hidden focus:text-text-secondary'
        )}
        title="Document statistics"
      >
        {/* Reading time only means something once there's a page or so to read */}
        {count.words >= 200 && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{formatReadingTime(readingMinutes(count.words))} read</span>
          </span>
        )}
        {selection && selection.characters > 0 ? (
          <span className="text-text-secondary">
            {plural(selection.words, 'word')}, {plural(selection.characters, 'character')} selected
          </span>
        ) : (
          <>
            {goal ? <GoalProgress words={count.words} goal={goal} /> : <span>{plural(count.words, 'word')}</span>}
            <span>{plural(count.characters, 'character')}</span>
          </>
        )}
      </button>

      <Modal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title="Document statistics"
      >
        {goalKey && <GoalSetting goalKey={goalKey} goal={goal} words={count.words} />}
        <DocumentStats />
      </Modal>
    </>
  );
}

// The full statistics walk the document several times; this mounts only while the dialog is open
function DocumentStats() {
  const content = useActiveContent();
  const stats = useMemo(() => calculateTextStats(content), [content]);

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <StatCard
          icon={Type}
          label="Characters"
          value={formatNumber(stats.characters)}
          subValue={`${formatNumber(stats.charactersNoSpaces)} without spaces`}
        />
        <StatCard
          icon={FileText}
          label="Words"
          value={formatNumber(stats.words)}
        />
        <StatCard
          icon={AlignLeft}
          label="Lines"
          value={formatNumber(stats.lines)}
        />
        <StatCard
          icon={BookOpen}
          label="Paragraphs"
          value={formatNumber(stats.paragraphs)}
        />
        <StatCard
          icon={Clock}
          label="Reading time"
          value={formatReadingTime(stats.readingTime)}
          subValue="~200 words/min"
        />
        <StatCard
          icon={Mic}
          label="Speaking time"
          value={formatReadingTime(stats.speakingTime)}
          subValue="~150 words/min"
        />
      </div>

      <div className="mt-4 pt-4 border-t border-rule">
        <p className="text-xs text-text-muted">
          Sentences: {formatNumber(stats.sentences)}
        </p>
      </div>
    </>
  );
}

function GoalProgress({ words, goal }: { words: number; goal: number }) {
  const done = words >= goal;

  return (
    <span className={cn('flex items-center gap-1.5', done && 'text-[#15803D]')}>
      <span aria-hidden className="relative w-12 h-1 rounded-full bg-rule overflow-hidden">
        <span
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]',
            done ? 'bg-[#15803D]' : 'bg-accent-primary'
          )}
          style={{ width: `${Math.min(100, (words / goal) * 100)}%` }}
        />
      </span>
      {done && <Check className="w-3 h-3" aria-hidden />}
      <span>
        {formatNumber(words)} / {plural(goal, 'word')}
      </span>
    </span>
  );
}

// A word goal for the open document; saved with the settings
function GoalSetting({ goalKey, goal, words }: { goalKey: string; goal: number | undefined; words: number }) {
  const setWordGoal = useSettingsStore((s) => s.setWordGoal);
  const [draft, setDraft] = useState(goal ? String(goal) : '');
  const value = Number(draft);
  const valid = Number.isInteger(value) && value > 0;

  return (
    <form
      className="mb-5 flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();

        if (valid) setWordGoal(goalKey, value);
      }}
    >
      <div className="flex-1">
        <Input
          id="word-goal"
          label="Word goal for this document"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          placeholder="e.g. 1000"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          hint={goal ? `${formatNumber(Math.max(0, goal - words))} to go` : 'The status bar shows your progress'}
        />
      </div>
      <div className="flex gap-2 mb-6">
        <Button type="submit" variant="secondary" disabled={!valid || value === goal}>
          <Target className="w-4 h-4" />
          Set goal
        </Button>
        {goal && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setWordGoal(goalKey, null);
              setDraft('');
            }}
          >
            Remove
          </Button>
        )}
      </div>
    </form>
  );
}

interface StatCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
}

function StatCard({ icon: Icon, label, value, subValue }: StatCardProps) {
  return (
    <div className="p-3 rounded-lg bg-panel">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-accent-primary" />
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <div className="text-lg font-semibold text-text-primary">{value}</div>
      {subValue && (
        <div className="text-xs text-text-muted mt-0.5">{subValue}</div>
      )}
    </div>
  );
}
