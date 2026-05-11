export const authFetch = async (path: string, options: RequestInit = {}) => {
  const token = sessionStorage.getItem('nexus_session_token');

  console.log(`authFetch: ${options.method || 'GET'} ${path}`);
  console.log('authFetch token:', token);

  if (!token || token === 'undefined' || token === 'null') {
    console.error('authFetch: No valid token found in sessionStorage');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token && token !== 'undefined' && token !== 'null') {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Merge with any existing headers
  if (options.headers) {
    Object.assign(headers, options.headers);
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  console.log(`authFetch response: ${response.status} ${path}`);
  return response;
};
