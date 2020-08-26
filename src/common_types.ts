export type StatusValue = 'succeeded' | 'failed' | 'skipped';

export type FilmStrips = Array<{
  snapshot: string;
  name: string;
  ts: number;
}>;
