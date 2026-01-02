// Export generated notes to text file for desktop transfer

export interface NoteExport {
  patientName?: string;
  mrn?: string;
  noteType: string;
  dateGenerated: string;
  transcript: string;
  generatedNote: string;
}

export function exportNoteToText(note: NoteExport): void {
  const timestamp = new Date().toLocaleString();
  const filename = `clinical-note-${note.patientName?.replace(/\s+/g, '-') || 'unknown'}-${new Date().toISOString().split('T')[0]}.txt`;
  
  const content = `
================================================================================
                           CLINICAL NOTE EXPORT
================================================================================

Patient: ${note.patientName || 'N/A'}
MRN: ${note.mrn || 'N/A'}
Note Type: ${note.noteType}
Date Generated: ${note.dateGenerated}
Exported: ${timestamp}

================================================================================
                              TRANSCRIPT
================================================================================

${note.transcript || 'No transcript available'}

================================================================================
                            GENERATED NOTE
================================================================================

${note.generatedNote}

================================================================================
                        END OF CLINICAL NOTE
================================================================================
`.trim();

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportNoteToJSON(note: NoteExport): void {
  const filename = `clinical-note-${note.patientName?.replace(/\s+/g, '-') || 'unknown'}-${new Date().toISOString().split('T')[0]}.json`;
  
  const data = {
    ...note,
    exportedAt: new Date().toISOString(),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function copyNoteToClipboard(note: NoteExport): Promise<void> {
  const content = `
CLINICAL NOTE - ${note.noteType}
Patient: ${note.patientName || 'N/A'} | MRN: ${note.mrn || 'N/A'}
Date: ${note.dateGenerated}

${note.generatedNote}
`.trim();

  return navigator.clipboard.writeText(content);
}
