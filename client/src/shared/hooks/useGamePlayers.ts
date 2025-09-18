import { useEffect, useState } from 'react';

export type GamePlayer = { id: string; name: string; position?: string };

export function useGamePlayers(gameId?: string | number) {
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchPlayers(signal?: AbortSignal) {
    setError(null);
    setPlayers([]);
    if (!gameId) return;
    setLoading(true);
    try {
      const endpoint = `/api/games/${encodeURIComponent(String(gameId))}/players`;
      const res = await fetch(endpoint, { signal });
      if (!res.ok) throw new Error(`players fetch failed: ${res.status}`);
      const data = await res.json();
      let list: GamePlayer[];
      if (Array.isArray(data)) {
        list = data.map((p: any) => {
          const id = String(p.id ?? p.player_id ?? p.nfl_player_id ?? p.slug ?? p.name ?? '');
          const name = String(
            p.name ?? p.full_name ?? p.player_name ??
            (p.first_name || p.last_name ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() : id)
          );
          const position = p.position ?? p.pos ?? p.role ?? undefined;
          return { id, name, position };
        });
      } else if (data && typeof data === 'object') {
        list = Object.entries(data).map(([id, label]) => ({ id: String(id), name: String(label ?? ''), position: undefined }));
      } else {
        list = [];
      }
      setPlayers(list);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setError(e?.message || 'Failed to load players');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetchPlayers(controller.signal);
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  return { players, loading, error, reload: () => fetchPlayers() };
}
