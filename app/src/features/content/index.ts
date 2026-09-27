import { createElement, type ReactNode } from 'react';
import type { BlockInput } from '../../../../shared/api';
import type { StudentBlock } from '../../../../shared/domain';
import { DocumentEditor } from './editors/DocumentEditor';
import { LinkEditor } from './editors/LinkEditor';
import { ScenarioEditor } from './editors/ScenarioEditor';
import { TableEditor } from './editors/TableEditor';
import { VideoEditor } from './editors/VideoEditor';
import { FileEditor } from './editors/FileEditor';
import { LegacyBlockFields, LegacyBlockPlayer } from './legacy';
import { DocumentPlayer } from './players/DocumentPlayer';
import { LinkPlayer } from './players/LinkPlayer';
import { ScenarioPlayer } from './players/ScenarioPlayer';
import { TablePlayer } from './players/TablePlayer';
import { VideoPlayer } from './players/VideoPlayer';
import { FilePlayer } from './players/FilePlayer';

export { DocumentEditor, LinkEditor, ScenarioEditor, TableEditor, VideoEditor };
export { DocumentPlayer, LinkPlayer, ScenarioPlayer, TablePlayer, VideoPlayer };
export { LegacyBlockFields, LegacyBlockPlayer };

export function BlockEditor({ value, onChange, courseId }: { value: BlockInput; onChange: (value: BlockInput) => void; courseId?: string }): ReactNode {
  switch (value.type) {
    case 'document': return createElement(DocumentEditor, { value, onChange });
    case 'table': return createElement(TableEditor, { value, onChange });
    case 'scenario': return createElement(ScenarioEditor, { value, onChange });
    case 'link': return createElement(LinkEditor, { value, onChange });
    case 'video': return createElement(VideoEditor, { value, onChange });
    case 'heading':
    case 'text':
    case 'callout':
    case 'image':
    case 'check':
      return createElement(LegacyBlockFields, { block: value, onChange });
    case 'file':
      return createElement(FileEditor, { value, onChange, courseId: courseId ?? '' });
    default: {
      const unreachable: never = value;
      return unreachable;
    }
  }
}

export function BlockPlayer({ block, lessonId, readOnly = false }: { block: StudentBlock; lessonId: string; readOnly?: boolean }): ReactNode {
  switch (block.type) {
    case 'document': return createElement(DocumentPlayer, { value: block });
    case 'table': return createElement(TablePlayer, { value: block });
    case 'scenario': return createElement(ScenarioPlayer, { value: block });
    case 'link': return createElement(LinkPlayer, { value: block });
    case 'video': return createElement(VideoPlayer, { value: block });
    case 'heading':
    case 'text':
    case 'callout':
    case 'image':
    case 'check':
      return createElement(LegacyBlockPlayer, { block, lessonId, readOnly });
    case 'file':
      return createElement(FilePlayer, { value: block });
    default: {
      const unreachable: never = block;
      return unreachable;
    }
  }
}
