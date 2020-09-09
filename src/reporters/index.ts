import BaseReporter from './base';
import JSONReporter from './json';

export const reporters = {
  default: BaseReporter,
  json: JSONReporter,
};
