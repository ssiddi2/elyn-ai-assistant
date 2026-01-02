import React from 'react';
import { Button } from '@/components/ui/button';

interface NoteSectionProps {
  title: string;
  content: string;
  onCopy: (text: string) => void;
}

/**
 * Component for displaying a section of a clinical note.
 * Includes a title, content, and copy button.
 */
const NoteSection = ({ title, content, onCopy }: NoteSectionProps) => (
  <div className="mb-4">
    <div className="flex justify-between items-center mb-2">
      <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
        {title}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCopy(content)}
        className="text-xs h-6 px-2"
      >
        Copy
      </Button>
    </div>
    <div className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
      {content}
    </div>
  </div>
);

export default NoteSection;
