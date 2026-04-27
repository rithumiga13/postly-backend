import { NotImplementedError } from '../../../lib/errors.js';

export function getInstagramClient() {
  return {
    async post(_content, _tokens) {
      throw new NotImplementedError('Instagram posting not implemented yet');
    },
  };
}
