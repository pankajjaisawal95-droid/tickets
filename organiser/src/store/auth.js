import { create } from 'zustand';

/*
 * Organiser auth state. Tokens are persisted to localStorage so a refresh keeps
 * the session. `user` (org name / email / kyc_status) is kept for display — the
 * authoritative kyc_status is always re-fetched from /organiser/me on load.
 * Uses a DIFFERENT storage key from the admin app so the two portals don't clash.
 */
const LS_KEY = 'ticket_organiser_auth';

const load = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
};

const persist = (state) => {
  const { accessToken, refreshToken, user } = state;
  localStorage.setItem(LS_KEY, JSON.stringify({ accessToken, refreshToken, user }));
};

const initial = load();

export const useAuth = create((set, get) => ({
  accessToken: initial.accessToken || null,
  refreshToken: initial.refreshToken || null,
  user: initial.user || null,

  isAuthed: () => !!get().accessToken,

  login: ({ accessToken, refreshToken, user }) => {
    set({ accessToken, refreshToken, user });
    persist(get());
  },

  setAccessToken: (accessToken) => {
    set({ accessToken });
    persist(get());
  },

  logout: () => {
    set({ accessToken: null, refreshToken: null, user: null });
    localStorage.removeItem(LS_KEY);
  }
}));
