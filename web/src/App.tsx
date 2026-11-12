import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Backdrop from './components/Backdrop';
import { HotspotDrawer } from './components/HotspotDrawer';
import { Layout, NAV_ITEMS } from './components/Layout';
import type { ViewKey } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Hotspots } from './pages/Hotspots';
import { Keywords } from './pages/Keywords';
import { Settings } from './pages/Settings';
import { useLive } from './hooks/useLive';
import { api } from './api';
import type { Hotspot } from './types';

type Toast = { id: number; message: string; tone: 'ok' | 'error' | 'signal' };

const viewFromHash = (): ViewKey => {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const found = NAV_ITEMS.find((item) => item.key === raw);
  return found?.key ?? 'dashboard';
};

export default function App() {
  const [view, setView] = useState<ViewKey>(viewFromHash);
  const [pulse, setPulse] = useState(0);
  const [selected, setSelected] = useState<Hotspot | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [aiReady, setAiReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [headlines, setHeadlines] = useState<{ id: number; title: string; importance: string | null }[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current, { id, message, tone }].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const onNavigate = useCallback((next: ViewKey) => {
    setView(next);
    window.location.hash = `/${next}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    api
      .health()
      .then((health) => {
        setAiReady(health.capabilities.ai);
        setCollecting(health.collecting);
      })
      .catch(() => setAiReady(false));
  }, []);

  useEffect(() => {
    let alive = true;
    api
      .hotspots({ limit: 6 })
      .then((data) => {
        if (!alive) return;
        setHeadlines(data.items.map((item) => ({ id: item.id, title: item.title, importance: item.importance })));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pulse]);

  const { status, online } = useLive({
    onHotspotNew: (hotspot) => {
      setPulse((value) => value + 1);
      toastId.current += 1;
      const id = toastId.current;
      setToasts((current) =>
        [
          ...current,
          {
            id,
            message: `新信号 · ${hotspot.title.slice(0, 42)}${hotspot.title.length > 42 ? '…' : ''}`,
            tone: 'signal' as const,
          },
        ].slice(-4),
      );
      window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 6000);
    },
    onHotspotUpdate: (hotspot) => {
      setSelected((current) => (current && current.id === hotspot.id ? hotspot : current));
      setPulse((value) => value + 1);
    },
    onNotification: (payload) => {
      notify(`已推送：${String(payload.title ?? '').slice(0, 40)}`);
    },
    onRun: (payload) => {
      if (payload.status === 'running') setCollecting(true);
      if (payload.status === 'success' || payload.status === 'failed') {
        setCollecting(false);
        setPulse((value) => value + 1);
      }
    },
  });

  const runScan = async () => {
    setScanning(true);
    try {
      const result = await api.collect();
      notify(`扫描完成：命中 ${result.found ?? 0} 条，新增 ${result.created ?? 0} 条，研判 ${result.analyzed ?? 0} 条`);
      setPulse((value) => value + 1);
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setScanning(false);
    }
  };

  const page = useMemo(() => {
    switch (view) {
      case 'hotspots':
        return <Hotspots pulse={pulse} onOpen={setSelected} notify={notify} />;
      case 'keywords':
        return <Keywords pulse={pulse} onChanged={() => setPulse((value) => value + 1)} notify={notify} />;
      case 'settings':
        return <Settings notify={notify} onChanged={() => setPulse((value) => value + 1)} />;
      default:
        return (
          <Dashboard
            pulse={pulse}
            onOpen={setSelected}
            onNavigate={onNavigate}
            onScan={runScan}
            scanning={scanning}
            notify={notify}
            aiReady={aiReady}
          />
        );
    }
  }, [view, pulse, notify, onNavigate, aiReady, scanning]);

  return (
    <>
      <Backdrop />
      <Layout
        view={view}
        onNavigate={onNavigate}
        status={status}
        online={online}
        collecting={collecting}
        scanning={scanning}
        onScan={runScan}
        aiReady={aiReady}
        headlines={headlines}
      >
        {page}
      </Layout>

      <HotspotDrawer
        hotspot={selected}
        onClose={() => setSelected(null)}
        onUpdated={(updated) => {
          setSelected(updated);
          setPulse((value) => value + 1);
        }}
        notify={notify}
      />

      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`toast toast--${toast.tone}`} key={toast.id}>
            <span className="toast__mark">{toast.tone === 'error' ? '!' : toast.tone === 'signal' ? '◈' : '✓'}</span>
            <p>{toast.message}</p>
          </div>
        ))}
      </div>
    </>
  );
}
