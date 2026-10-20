import { useState } from 'react';
import { Clock, FileText, Type, AlignLeft, BookOpen, Mic } from 'lucide-react';
import { Modal } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useWordCount } from '../hooks';
import { formatReadingTime, formatNumber } from '../utils';

export function WordCountWidget() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const stats = useWordCount();

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={cn(
          'flex items-center gap-3 text-text-muted',
          'hover:text-text-secondary transition-colors cursor-pointer',
          'focus:outline-none focus:text-text-secondary'
        )}
        title="Document statistics"
      >
        {/* Reading time only means something once there's a page or so to read */}
        {stats.words >= 200 && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{formatReadingTime(stats.readingTime)} read</span>
          </span>
        )}
        <span>
          {formatNumber(stats.words)} {stats.words === 1 ? 'word' : 'words'}
        </span>
        <span>{formatNumber(stats.characters)} characters</span>
      </button>

      <Modal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        title="Document statistics"
      >
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
      </Modal>
    </>
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
