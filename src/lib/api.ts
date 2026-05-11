export const authFetch = async (url: string, options: RequestInit = {}) => {
  const token = sessionStorage.getItem('nexus_token');
  
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    }
  });
};
