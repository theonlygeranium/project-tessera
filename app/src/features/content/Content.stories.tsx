import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { DocumentEditor as DocumentEditorForm } from './editors/DocumentEditor';
import { LinkEditor as LinkEditorForm } from './editors/LinkEditor';
import { ScenarioEditor as ScenarioEditorForm } from './editors/ScenarioEditor';
import { TableEditor as TableEditorForm } from './editors/TableEditor';
import { VideoEditor as VideoEditorForm } from './editors/VideoEditor';
import type { DocumentContent, LinkContent, ScenarioContent, TableContent, VideoContent } from './model';
import { DocumentPlayer as DocumentPlayerView } from './players/DocumentPlayer';
import { LinkPlayer as LinkPlayerView } from './players/LinkPlayer';
import { ScenarioPlayer as ScenarioPlayerView } from './players/ScenarioPlayer';
import { TablePlayer as TablePlayerView } from './players/TablePlayer';
import { VideoPlayer as VideoPlayerView } from './players/VideoPlayer';
import { dataSourceScenario, libraryLink, methodsDocument, methodsVideo, studyHoursTable, uploadedVideo } from './samples';
import styles from './content.module.css';

const meta = { title: 'Features/Content' } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Frame({ title, children }: { title: string; children: ReactNode }) {
  return <main className={styles.frame}><h1>{title}</h1>{children}</main>;
}

function EditorStory<T>({ title, initial, Editor }: { title: string; initial: T; Editor: (props: { value: T; onChange: (value: T) => void }) => ReactNode }) {
  const [value, setValue] = useState(initial);
  return <Frame title={title}><Editor value={value} onChange={setValue} /></Frame>;
}

export const DocumentEditor: Story = { render: () => <EditorStory title="Document editor" initial={methodsDocument} Editor={DocumentEditorForm} /> };
export const TableEditor: Story = { render: () => <EditorStory title="Table editor" initial={studyHoursTable} Editor={TableEditorForm} /> };
export const ScenarioEditor: Story = { render: () => <EditorStory title="Scenario editor" initial={dataSourceScenario} Editor={ScenarioEditorForm} /> };
export const LinkEditor: Story = { render: () => <EditorStory title="Link editor" initial={libraryLink} Editor={LinkEditorForm} /> };
export const VideoEditor: Story = { render: () => <EditorStory title="Video editor" initial={methodsVideo} Editor={VideoEditorForm} /> };
export const DocumentPlayer: Story = { render: () => <Frame title="Document"><DocumentPlayerView value={methodsDocument} /></Frame> };
export const TablePlayer: Story = { render: () => <Frame title="Study hours"><TablePlayerView value={studyHoursTable} /></Frame> };
export const ScenarioPlayer: Story = { render: () => <Frame title="Scenario"><ScenarioPlayerView value={dataSourceScenario} /></Frame> };
export const LinkPlayer: Story = { render: () => <Frame title="Link"><LinkPlayerView value={libraryLink} /></Frame> };
export const VideoPlayer: Story = { render: () => <Frame title="Video"><VideoPlayerView value={methodsVideo} /></Frame> };
export const UploadVideoPlayer: Story = { render: () => <Frame title="Uploaded video"><VideoPlayerView value={uploadedVideo} /></Frame> };
