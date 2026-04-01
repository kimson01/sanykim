// Resolves local upload paths to a fully qualified backend URL.
export const resolveAssetUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
  const backendBase = apiBase.replace(/\/api\/?$/, '');
  return url.startsWith('/') ? `${backendBase}${url}` : `${backendBase}/${url}`;
};

