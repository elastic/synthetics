import { VoidCallback } from '../common_types';

export class Step {
  name: string;
  index: number;
  callback: VoidCallback;

  constructor(name: string, index: number, callback: VoidCallback) {
    this.name = name;
    this.index = index;
    this.callback = callback;
  }
}
