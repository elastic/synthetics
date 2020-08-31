import { Protocol } from 'playwright/types/protocol';

export type StatusValue = 'succeeded' | 'failed' | 'skipped';

export type FilmStrip = {
  snapshot: string;
  name: string;
  ts: number;
};

export type NetworkInfo = {
  url: string;
  method: string;
  type: string;
  request: Protocol.Network.Request;
  response: Protocol.Network.Response;
  isNavigationRequest: boolean;
  start: number;
  end: number;
  status: number;
};
