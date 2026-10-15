const MINUTE = 60000;

export const formatDuration = (milliseconds) => {
  if (milliseconds <= 0) return "maintenant";
  const totalMinutes = Math.max(1, Math.round(milliseconds / MINUTE));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} j ${hours} h`;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, "0")}`;
  return `${minutes} min`;
};

export const formatAge = (milliseconds) => {
  const minutes = Math.floor(milliseconds / MINUTE);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `il y a ${hours} h`;
  return `il y a ${Math.floor(hours / 24)} j`;
};
