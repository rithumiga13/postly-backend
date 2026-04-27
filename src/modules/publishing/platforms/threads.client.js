import { NotImplementedError } from '../../../lib/errors.js';

export function getThreadsClient() {
  return {
    async post(_content, _tokens) {
      throw new NotImplementedError('Threads posting not implemented yet');
    },
  };
}
