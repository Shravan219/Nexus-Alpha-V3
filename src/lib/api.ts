export const authFetch = async (path: string, options: RequestInit = {}) => {
  const token = sessionStorage.getItem('nexus_session_token');

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
