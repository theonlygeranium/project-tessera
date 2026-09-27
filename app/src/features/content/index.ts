import { createElement, type ReactNode } from 'react';
import type { BlockInput } from '../../../../shared/api';
import type { StudentBlock } from '../../../../shared/domain';
import { DocumentEditor } from './editors/DocumentEditor';
import { LinkEditor } from './editors/LinkEditor';
import { ScenarioEditor } from './editors/ScenarioEditor';
import { TableEditor } from './editors/TableEditor';
import { VideoEditor } from './editors/VideoEditor';
import { LegacyBlockFields, LegacyBlockPlayer } from './legacy';
import { DocumentPlayer } from './players/DocumentPlayer';
import { LinkPlayer } from './players/LinkPlayer';
import { ScenarioPlayer } from './players/ScenarioPlayer';
import { TablePlayer } from './players/TablePlayer';
import { VideoPlayer } from './players/VideoPlayer';
import styles from './content.module.css';

export { DocumentEditor, LinkEditor, ScenarioEditor, TableEditor, VideoEditor };
export { DocumentPlayer, LinkPlayer, ScenarioPlayer, TablePlayer, VideoPlayer };
export { LegacyBlockFields, LegacyBlockPlayer };

function fileNote(): ReactNode {
  return createElement('p', { className: styles.note }, 'File blocks can be added after a file is uploaded.');
}

export function BlockEditor({ value, onChange }: { value: BlockInput; onChange: (value: BlockInput) => void }): ReactNode {
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
      return fileNote();
    default: {
      const unreachable: never = value;
      return unreachable;
    }
  }
}

export function BlockPlayer({ block, lessonId }: { block: StudentBlock; lessonId: string }): ReactNode {
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
      return createElement(LegacyBlockPlayer, { block, lessonId });
    case 'file':
      return fileNote();
    default: {
      const unreachable: never = block;
      return unreachable;
    }
  }
}
