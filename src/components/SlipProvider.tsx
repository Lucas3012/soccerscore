"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SlipItem } from "@/lib/types";

type SlipContextValue = {
  items: SlipItem[];
  add: (item: SlipItem) => void;
  remove: (key: string) => void;
  clear: () => void;
  stakeText: string;
  setStakeText: (value: string) => void;
  totalOdd: number;
  has: (key: string) => boolean;
};

const SlipContext = createContext<SlipContextValue | null>(null);
const STORAGE_KEY = "ss_slip_v1";

export function SlipProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SlipItem[]>([]);
  const [stakeText, setStakeText] = useState("10,00");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { items?: SlipItem[]; stake?: string };
        if (Array.isArray(parsed.items)) {
          setItems(parsed.items.filter((item) => item.kickoff > Date.now()));
        }
        if (typeof parsed.stake === "string" && parsed.stake.trim() !== "") {
          setStakeText(parsed.stake);
        }
      }
    } catch {
      /* ignore corrupted storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ items, stake: stakeText }));
    } catch {
      /* ignore */
    }
  }, [items, stakeText, ready]);

  const add = useCallback((item: SlipItem) => {
    setItems((prev) => [...prev.filter((i) => i.matchId !== item.matchId), item]);
  }, []);

  const remove = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const totalOdd = useMemo(() => items.reduce((acc, item) => acc * item.odd, 1), [items]);

  const has = useCallback((key: string) => items.some((i) => i.key === key), [items]);

  const value = useMemo(
    () => ({ items, add, remove, clear, stakeText, setStakeText, totalOdd, has }),
    [items, add, remove, clear, stakeText, totalOdd, has],
  );

  return <SlipContext.Provider value={value}>{children}</SlipContext.Provider>;
}

export function useSlip(): SlipContextValue {
  const ctx = useContext(SlipContext);
  if (!ctx) throw new Error("useSlip precisa estar dentro de SlipProvider");
  return ctx;
}
