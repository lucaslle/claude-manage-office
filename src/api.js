export const fetchSessionDetails = async (sessionId) => {
  const response = await fetch(`/api/session/${encodeURIComponent(sessionId)}`, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Erreur ${response.status}`);
  return body;
};
