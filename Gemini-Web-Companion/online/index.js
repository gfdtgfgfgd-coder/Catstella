(async () => {
  const hub = await window.mountCatstellaStore(document.getElementById('content-hub'),{
    maintenance: document.querySelector('.hub-web-maintenance')
  });
  const filter = location.hash.slice(1);
  if (['character','wallpaper','theme'].includes(filter)) hub.filter(filter);
  void hub.load();
})();
