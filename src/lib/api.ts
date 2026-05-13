import { SESSION_TOKEN_KEY } from './constants';

export const authFetch = async (path: string, options: RequestInit = {}) => {
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token && token !== 'undefined' && token !== 'null') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  return fetch(path, {
    ...options,
    headers
  });
};
