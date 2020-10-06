export type StepCallback = () => void;

export class Step {
  name: string;
  index: number;
  callback: StepCallback;

  constructor(name: string, index: number, callback: StepCallback) {
    this.name = name;
    this.index = index;
    this.callback = callback;
  }
}
