import { cn } from "@/lib/utils";
import Image from "next/image";
import { asset } from "../../_shared/cdn";

const SplashScreen = () => {
  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999] grid place-content-center bg-white transition-all duration-700",
      )}
    >
      <div className="flex items-center gap-5">
        <span className="logo-ring ">
          <Image
            src={asset("voltline/logo-ring")}
            alt="logo"
            width={100}
            height={100}
            className="animate-spin"
          />
        </span>
        <span className="logo-text">
          <Image
            quality={100}
            src={asset("voltline/logo-text")}
            alt="logo"
            width={200}
            height={100}
          />
        </span>
      </div>
    </div>
  );
};

export default SplashScreen;
