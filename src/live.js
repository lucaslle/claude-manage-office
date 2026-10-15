export const fetchLiveState = async () => {
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) return null;
    const body = await response.json();
    return Array.isArray(body.characters) ? body : null;
  } catch {
    return null;
  }
};

export const subscribeLive = ({ onState, onLost }) => {
  const source = new EventSource("/api/stream");
  source.onmessage = (event) => onState(JSON.parse(event.data));
  source.onerror = () => onLost();
  return source;
};
