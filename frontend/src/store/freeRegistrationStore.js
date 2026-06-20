import { create } from "zustand";
 
export const freeRegistrationStore = create((set) => ({
  name: "",
  email: "",
  phone: "",
  event: "Holi",
 
  setField: (field, value) =>
    set((state) => ({
      ...state,
      [field]: value,
    })),
 
  resetForm: () =>
    set({
      name: "",
      email: "",
      phone: "",
      event: "Holi",
    }),
}));