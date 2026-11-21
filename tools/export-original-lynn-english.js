/* Run only on the original Lynn English Site, in your own browser profile. */
(() => {
  if (location.origin !== "https://lynn-english.hshsj4dzwb.chatgpt.site") {
    throw new Error("Open the original Lynn English Site before exporting.");
  }
  const words = JSON.parse(localStorage.getItem("lynn-english-words") || "[]");
  if (!Array.isArray(words)) throw new Error("The saved expressions could not be read.");
  const days = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const match = /^lynn-english-progress-(\d{4}-\d{2}-\d{2})$/.exec(key);
    if (match) days[match[1]] = JSON.parse(localStorage.getItem(key));
  }
  const backup = {app: "lynn-english-site2", version: 1, words, days};
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], {type: "application/json"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = "original-lynn-english-backup.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
})();
