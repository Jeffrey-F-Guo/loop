import { create } from 'zustand';

export const REVERTED_MESSAGE = "Couldn't save — change reverted";

interface Toast {
  id: number;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message) => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { id, message }] });
    setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const showToast = (message: string) => useToastStore.getState().show(message);
