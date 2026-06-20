import { create } from 'zustand';

/*
 * Auth state only (per the brief). Tokens are persisted to localStorage so a
 * refresh keeps the session. `mobile` is kept for display.
 */
const LS_KEY = 'ticket_admin_auth';

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
};

const persist = (state) => {
  const { accessToken, refreshToken, mobile } = state;
  localStorage.setItem(LS_KEY, JSON.stringify({ accessToken, refreshToken, mobile }));
};

const initial = load();

export const useAuth = create((set, get) => ({
  accessToken: initial.accessToken || null,
  refreshToken: initial.refreshToken || null,
  mobile: initial.mobile || null,

  isAuthed: () => !!get().accessToken,

  login: ({ accessToken, refreshToken, mobile }) => {
    set({ accessToken, refreshToken, mobile });
    persist(get());
  },

  setAccessToken: (accessToken) => {
    set({ accessToken });
    persist(get());
  },

  logout: () => {
    set({ accessToken: null, refreshToken: null, mobile: null });
    localStorage.removeItem(LS_KEY);
  }
}));
