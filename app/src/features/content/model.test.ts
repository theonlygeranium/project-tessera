import { describe, expect, it } from 'vitest';
import { validateBlockContent } from '../../../../shared/service/validate';
import {
  addColumn, addRow, embedSrc, fileContentUrl, minutesLabel, moveColumn, nodeOptionLabel,
  pointsNowhere, rectangular, removeColumn, videoHasCaptionsOrTranscript, videoProviderFromUrl, videoUrlError,
} from './model';
import { dataSourceScenario, libraryLink, methodsDocument, methodsVideo, studyHoursTable, uploadedVideo } from './samples';

describe('content block helpers', () => {
  it('accepts the sample blocks the editors ship with', () => {
    expect(validateBlockContent(methodsDocument)).toEqual(methodsDocument);
    expect(validateBlockContent(studyHoursTable)).toEqual(studyHoursTable);
    expect(validateBlockContent(dataSourceScenario)).toEqual(dataSourceScenario);
    expect(validateBlockContent(libraryLink)).toEqual(libraryLink);
    expect(validateBlockContent(methodsVideo)).toEqual(methodsVideo);
    expect(validateBlockContent(uploadedVideo)).toEqual(uploadedVideo);
  });

  it('keeps table rows rectangular when columns and rows change', () => {
    const rows = [['Week', 'Hours'], ['Week 1', '3']];
    const wider = addColumn(rows);
    expect(wider).toEqual([['Week', 'Hours', ''], ['Week 1', '3', '']]);
    expect(addRow(wider)).toEqual([['Week', 'Hours', ''], ['Week 1', '3', ''], ['', '', '']]);
    expect(moveColumn(wider, 2, -1)[0]).toEqual(['Week', '', 'Hours']);
    expect(removeColumn(wider, 1).every((row) => row.length === 2)).toBe(true);
    expect(rectangular([['a', 'b'], ['c']])).toEqual([['a', 'b'], ['c', '']]);
    expect(rectangular([])).toEqual([['', '']]);
  });

  it('reads a YouTube or Vimeo URL and builds an embed src', () => {
    expect(videoProviderFromUrl('https://www.youtube.com/watch?v=tessera101a')).toBe('youtube');
    expect(videoProviderFromUrl('https://youtu.be/tessera101a')).toBe('youtube');
    expect(videoProviderFromUrl('https://vimeo.com/76979871')).toBe('vimeo');
    expect(videoProviderFromUrl('https://player.vimeo.com/video/76979871')).toBe('vimeo');
    expect(videoProviderFromUrl('http://www.youtube.com/watch?v=tessera101a')).toBeNull();
    expect(videoProviderFromUrl('https://example.edu/watch?v=tessera101a')).toBeNull();
    expect(embedSrc({ provider: 'youtube', src: 'https://www.youtube.com/watch?v=tessera101a' })).toBe('https://www.youtube.com/embed/tessera101a');
    expect(embedSrc({ provider: 'youtube', src: 'https://youtu.be/tessera101a?t=4' })).toBe('https://www.youtube.com/embed/tessera101a');
    expect(embedSrc({ provider: 'youtube', src: 'https://www.youtube.com/shorts/tessera101a' })).toBe('https://www.youtube.com/embed/tessera101a');
    expect(embedSrc({ provider: 'vimeo', src: 'https://vimeo.com/channels/staffpicks/76979871' })).toBe('https://player.vimeo.com/video/76979871');
    expect(embedSrc({ provider: 'vimeo', src: 'https://player.vimeo.com/video/76979871' })).toBe('https://player.vimeo.com/video/76979871');
    expect(embedSrc({ provider: 'upload', src: 'file-methods-video' })).toBeNull();
    expect(videoUrlError('https://vimeo.com/76979871', 'youtube')).toMatch(/Vimeo/);
    expect(videoUrlError('https://www.youtube.com/watch?v=tessera101a', 'youtube')).toBeUndefined();
  });

  it('requires a transcript or a captions file, and names steps by their first words', () => {
    expect(videoHasCaptionsOrTranscript({ transcript: '  ', captionsFileId: null })).toBe(false);
    expect(videoHasCaptionsOrTranscript({ transcript: 'Spoken words.', captionsFileId: null })).toBe(true);
    expect(videoHasCaptionsOrTranscript({ transcript: '', captionsFileId: ' file-1 ' })).toBe(true);
    expect(minutesLabel(1)).toBe('1 minute');
    expect(minutesLabel(6)).toBe('6 minutes');
    expect(nodeOptionLabel({ id: 'start', text: 'The library lists three sources. Which one do you open first?' })).toBe('start — The library lists three sources. Which');
    expect(pointsNowhere('missing', ['start'])).toBe(true);
    expect(pointsNowhere('start', ['start'])).toBe(false);
    expect(fileContentUrl('file-methods-video')).toBe('/api/v1/files/file-methods-video/content');
    expect(fileContentUrl('a/b')).toBe('/api/v1/files/a%2Fb/content');
  });
});
