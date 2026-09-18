"use client";

import useWindowHeight from "../hooks/use-window-height";
// Inlined from the source util module, which was truncated mid-file in the
// original project and only exported this and `cn`.
const generateId = () => Math.random().toString(36).substring(2, 9);
import { useGSAP } from "../hooks/use-gsap";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { usePathname } from "next/navigation";
import React, {
  useState,
  SetStateAction,
  createContext,
  Dispatch,
  FormEvent,
  useCallback,
  useEffect,
} from "react";

// Props for the context
interface VoltlineCtxProps {
  hideNav: boolean;
  setHideNav: Dispatch<SetStateAction<boolean>>;

  openNavbar: boolean;
  setOpenNavbar: Dispatch<SetStateAction<boolean>>;
  isHeroInView: boolean;
  setIsHeroInView: Dispatch<SetStateAction<boolean>>;
  activeLink: string;
  setActiveLink: Dispatch<SetStateAction<string>>;
  contactModal: boolean;
  setContactModal: Dispatch<SetStateAction<boolean>>;
  waitlistModal: boolean;
  setWaitlistModal: Dispatch<SetStateAction<boolean>>;
}

export const VoltlineCtx = createContext<VoltlineCtxProps>({} as VoltlineCtxProps);

const text = `%c Made with \ud83d\udc9a Voltline ${new Date().getFullYear()}`,
  style = [
    "font-size: 12px",
    "color: #fffce1",
    "font-family: monospace",
    "background: #0e100f",
    "display: inline-block",
    "padding: 1rem 3rem",
    "border: 1px solid #1e40af",
    "border-radius: 4px;",
  ].join(";");
// Context provider
const VoltlineProvider = ({ children }: { children: React.ReactNode }) => {
  console.log(text, style);

  // GSAP START

  useGSAP(() => {
    if (CSS.supports("animation-timeline: scroll()")) return;

    gsap.registerPlugin(ScrollTrigger);
    gsap.to("[data-main-hero]", {
      scale: 0.6,
      ease: "power1.in",
      scrollTrigger: {
        trigger: "[data-main-hero]",
        scrub: true,
        start: "center top",
        end: "bottom top",
      },
    });
    gsap.set("[data-main-hero]", { "--opacity": 1 });
    gsap.to("[data-main-hero]", {
      "--opacity": 0,
      ease: "power1.in",
      scrollTrigger: {
        trigger: "[data-main-hero]",
        scrub: true,
        start: "center bottom",
        end: "bottom bottom",
      },
    });
  }, []);
  // GSAP END

  // useState states
  const { scrollY } = useWindowHeight();
  const [activeLink, setActiveLink] = useState("");
  const [hideNav, setHideNav] = useState(false);
  const [openNavbar, setOpenNavbar] = useState(false);
  const [isHeroInView, setIsHeroInView] = useState(false);
  const [contactModal, setContactModal] = useState(false);
  const [waitlistModal, setWaitlistModal] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const savedLink = localStorage.getItem("activeLink");
    if (savedLink) {
      setActiveLink(savedLink);
    }
  }, []);
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenNavbar(false);
      }
    };
    window.addEventListener("keyup", onEsc);
    return () => {
      window.removeEventListener("keyup", onEsc);
    };
  }, []);

  useEffect(() => {
    let prevScrollpos = scrollY;
    // console.log("PREV", prevScrollpos);
    window.onscroll = () => {
      const currentScrollPos = window.scrollY;

      if (prevScrollpos >= currentScrollPos) {
        setHideNav(false);
      } else {
        setHideNav(true);
        setOpenNavbar(false);
      }
      prevScrollpos = currentScrollPos;
    };
  }, [scrollY]);
  useEffect(() => {
    if (contactModal || waitlistModal) {
      document.body.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContactModal(false);
        setWaitlistModal(false);
      }
    };

    document.addEventListener("keyup", handleKeyDown);

    return () => {
      document.removeEventListener("keyup", handleKeyDown);
    };
  }, [contactModal, waitlistModal]);
  useEffect(() => {
    const newLink = pathname.replace("/", "");
    if (newLink) {
      setActiveLink(newLink);
    }
  }, [pathname]);

  const mobileTest = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator?.userAgent,
    );
  };

  const values = React.useMemo(
    () => ({
      hideNav,
      setHideNav,
      openNavbar,
      setOpenNavbar,
      isHeroInView,
      setIsHeroInView,
      activeLink,
      setActiveLink,
      contactModal,
      setContactModal,
      waitlistModal,
      setWaitlistModal,
    }),
    [
      hideNav,

      openNavbar,
      isHeroInView,
      activeLink,
      contactModal,
      waitlistModal,
    ],
  );

  return <VoltlineCtx.Provider value={values}>{children}</VoltlineCtx.Provider>;
};

export const useVoltline = () => {
  if (!VoltlineCtx) {
    throw new Error("useVoltline must be used within a VoltlineProvider");
  }
  return React.useContext(VoltlineCtx);
};

export default VoltlineProvider;
