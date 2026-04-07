import { JsonAdapter } from '../adapters/json.ts';
import { MarkdownAdapter } from '../adapters/markdown.ts';
import type { InvertAdapter } from '../adapters/interface.ts';

export interface InvertConfig {
  siteName: string;
  siteUrl: string;
  adapters: InvertAdapter[];
}

export const invertConfig: InvertConfig = {
  siteName: 'Invert',
  siteUrl: 'https://example.com',

  adapters: [
    new JsonAdapter({ contentDir: './content' }),
    new MarkdownAdapter({ source: 'local', contentDir: './markdown' }),
    new MarkdownAdapter({ source: 'local', contentDir: './docs' }),

    // Remote markdown from GitHub:
    // new MarkdownAdapter({
    //   source: 'github',
    //   repo: 'owner/repo',
    //   contentDir: 'content',
    //   branch: 'main',
    //   token: import.meta.env.GITHUB_TOKEN,
    // }),
  ],
};
