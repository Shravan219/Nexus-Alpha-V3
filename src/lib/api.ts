import { SESSION_TOKEN_KEY } from './constants';

export const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
  
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    }
  });
};
