// Server-Sent Events hub. emit(channel) tells every listener on that channel "something changed";
// clients re-fetch what they show.
function createEvents({ heartbeatMs = 25000 } = {}) {
  const channels = new Map();

  function subscribe(channel, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('retry: 3000\n\n');
    if (!channels.has(channel)) channels.set(channel, new Set());
    channels.get(channel).add(res);
    const beat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);
    res.on('close', () => {
      clearInterval(beat);
      channels.get(channel)?.delete(res);
    });
  }

  function emit(channel) {
    for (const res of channels.get(channel) || []) res.write('event: changed\ndata: {}\n\n');
  }

  return { subscribe, emit };
}

module.exports = { createEvents };
