import type { DocumentContent, LinkContent, ScenarioContent, TableContent, VideoContent } from './model';

export const methodsDocument: DocumentContent = {
  type: 'document',
  title: 'How to choose a data source',
  sections: [
    {
      heading: 'Start with the question',
      text: 'Priya is writing a methods note for a campus study of study habits. The question decides which source is useful.\n\nA source that cannot say who was asked will not support the claim.',
    },
    {
      heading: 'Check what the source records',
      text: 'Open the codebook before the spreadsheet. It names the questions, the people, and the dates.',
    },
  ],
};

export const studyHoursTable: TableContent = {
  type: 'table',
  caption: 'Study hours for Data Literacy 101',
  headerRow: true,
  rows: [
    ['Week', 'Topic', 'Hours'],
    ['Week 1', 'Reading a methods section', '3'],
    ['Week 2', 'Choosing a data source', '4'],
    ['Week 3', 'Checking a result', '2'],
  ],
};

export const dataSourceScenario: ScenarioContent = {
  type: 'scenario',
  title: 'Choosing a data source',
  setting: 'Priya is writing a methods note for a campus study of study habits. She has to name her source before Friday.',
  startNodeId: 'start',
  nodes: [
    {
      id: 'start',
      text: 'The library lists three sources. Which one do you open first?',
      outcome: '',
      choices: [
        {
          id: 'open-codebook',
          text: 'Open the survey codebook',
          nextNodeId: 'codebook',
          feedback: 'The codebook names who was asked, which questions were used, and when the survey ran.',
          quality: 'best',
        },
        {
          id: 'open-grades',
          text: 'Open last year\'s grade sheet',
          nextNodeId: 'grades',
          feedback: 'Grades describe a result. They do not say how the data was collected.',
          quality: 'okay',
        },
        {
          id: 'open-summary',
          text: 'Open a classmate\'s summary',
          nextNodeId: 'summary',
          feedback: 'The summary skips who was asked and how the questions were written.',
          quality: 'poor',
        },
      ],
    },
    {
      id: 'codebook',
      text: 'The codebook is open. It lists 214 students, the six questions, and the week of the survey.',
      outcome: 'You can describe who was asked and how. That is enough to cite the source.',
      choices: [],
    },
    {
      id: 'grades',
      text: 'The grade sheet lists scores by week. It does not name the survey questions.',
      outcome: 'You can report a result, but you still need a source that explains how the data was collected.',
      choices: [],
    },
    {
      id: 'summary',
      text: 'The summary says the class studied a lot. It does not name a source.',
      outcome: 'This path does not support the methods note. Start again from the codebook.',
      choices: [],
    },
  ],
};

export const libraryLink: LinkContent = {
  type: 'link',
  href: 'https://library.example.edu/guides/open-data',
  text: 'Library guide to open data',
  description: 'How to cite a public data set in a methods note.',
};

export const methodsVideo: VideoContent = {
  type: 'video',
  src: 'https://www.youtube.com/watch?v=tessera101a',
  provider: 'youtube',
  title: 'Reading a methods section',
  captionsFileId: null,
  transcript: 'The speaker reads one methods paragraph aloud and stops after each sentence.\n\nWrite down who was studied, what was measured, and what the source cannot say.',
  minutes: 6,
};

export const uploadedVideo: VideoContent = {
  type: 'video',
  src: 'file-methods-video',
  provider: 'upload',
  title: 'Reading a methods section',
  captionsFileId: 'file-methods-captions',
  transcript: 'The speaker reads one methods paragraph aloud and stops after each sentence.',
  minutes: 6,
};
