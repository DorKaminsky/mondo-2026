import { createContext, useCallback, useContext, useRef, useState, ReactNode } from 'react';

// Tracks whether the current page has unsaved form state and lets other
// components (like BottomNav) intercept navigation with a confirmation.
//
// MatchPredictPage calls setDirty(true/false) as its form state diverges
// from / matches the DB. BottomNav calls requestNav(path) — if dirty, the
// app shows a modal and the actual navigation only fires when the user
// confirms "Leave anyway".

type DirtyFormCtx = {
  isDirty: boolean;
  setDirty: (v: boolean) => void;
  // Returns true if nav can proceed immediately, false if it was queued for
  // confirmation. Either way, caller should NOT navigate when this returns
  // false — the context will fire `pending` once the user decides.
  requestNav: (action: () => void) => boolean;
  pendingNav: null | (() => void);
  cancelNav: () => void;
  confirmNav: () => void;
};

const Ctx = createContext<DirtyFormCtx | null>(null);

export function DirtyFormProvider({ children }: { children: ReactNode }) {
  const [isDirty, setIsDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  // Latest dirty value, read by requestNav so callers don't race the setter.
  const dirtyRef = useRef(false);

  const setDirty = useCallback((v: boolean) => {
    dirtyRef.current = v;
    setIsDirty(v);
  }, []);

  const requestNav = useCallback((action: () => void) => {
    if (!dirtyRef.current) {
      action();
      return true;
    }
    setPendingNav(() => action);
    return false;
  }, []);

  const cancelNav = useCallback(() => setPendingNav(null), []);
  const confirmNav = useCallback(() => {
    setPendingNav(curr => { curr?.(); return null; });
  }, []);

  return (
    <Ctx.Provider value={{ isDirty, setDirty, requestNav, pendingNav, cancelNav, confirmNav }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDirtyForm() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDirtyForm must be used inside <DirtyFormProvider>');
  return ctx;
}
