// src/App.jsx
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";

import Event from "./pages/Event";
import TicketSelection from "./pages/TicketSelection";
import Home from "./pages/Home";
import MyTickets from "./pages/MyTickets/MyTickets";
import TermsConditions from "./pages/Termandcondition";
import ContactUs from "./pages/Contactus";
import PrivacyPolicy from "./pages/Privacypolicy";
import  FreeRagistrationEvents  from "./components/freeregistration/FreeRagistrationEvents"

import LoginModal from "./components/auth/LoginModal";
import { ToastProvider } from "./context/ToastContext";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);
  return null;
}

function App() {
  return (
    <BrowserRouter>
     <ToastProvider>

      <ScrollToTop />

      {/* GLOBAL HEADER */}
      <Header />

      {/* PAGE ROUTES */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/event/:eventId" element={<Event />} />
        <Route path="/event/:eventId/tickets" element={<TicketSelection />} />
        <Route path="/my-tickets" element={<MyTickets />} />
         <Route path="/free-register/:eventId/:ticketTypeId" element={<FreeRagistrationEvents />} />
         <Route path="/contact" element={<ContactUs />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms" element={<TermsConditions />} />
      </Routes>

      {/* GLOBAL FOOTER */}
      <Footer />

      {/* GLOBAL LOGIN MODAL */}
      <LoginModal />

     </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
