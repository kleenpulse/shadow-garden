import { cn } from "@/lib/utils";
import React from "react";

type Props = {
  icon: any;
  title: string;
  info: string;
  isLink?: boolean;
  smalltext?: boolean;
};

const ContactCard = ({ icon, title, info, isLink, smalltext }: Props) => {
  return (
    <div className="flex w-full flex-col justify-between gap-y-6 rounded-xl border border-gray-200 p-5 transition-all duration-300 hover:border-[var(--card-rose)]/90 hover:bg-[var(--card-rose)]/20 hover:shadow-[0_8px_25px_0px_rgba(0,0,0,0.1)] md:h-[212px] md:p-8 lg:max-w-[404px]">
      <div className="flex h-10 w-10 items-center justify-center rounded-full text-[#524b4b] lg:h-12 lg:w-12">
        {icon}
      </div>
      <div className="flex flex-col gap-y-1">
        <h3 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[#524b4b] sm:text-[32px]">
          {title}
        </h3>
        <p
          className={cn(
            "font-[family-name:var(--font-display)] font-normal text-[#524b4b] ",
            isLink ? "cursor-pointer underline underline-offset-2" : "",
            smalltext
              ? "text-sm min-[400px]:text-base md:text-lg lg:text-base"
              : "sm:text-[20px]",
          )}
        >
          {info}
        </p>
      </div>
    </div>
  );
};

export default ContactCard;
