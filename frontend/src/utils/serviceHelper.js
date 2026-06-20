/* Format date like: Monday, 20 July 2024 */
export const formatDate = (datetime) => {
  if (!datetime) return "";

  const d = new Date(datetime);

  return d.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

/* Format time like: 06:00 PM */
export const formatTime = (datetime) => {
  if (!datetime) return "";

  const d = new Date(datetime);

  return d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};
export const formatRange = (start, end) => {
  const s = new Date(start).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short"
  });

  const e = new Date(end).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short"
  });

  return `${s} – ${e}`;
};
