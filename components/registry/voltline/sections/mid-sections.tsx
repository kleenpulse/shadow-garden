"use client";

import React from "react";
import TargetUsersSection from "./target-users-section";
import Benefits from "./benefits-section";
import Energy from "./energy-section";
import Solutions from "./solutions-section";

const MidSections = () => {
  return (
    <>
      <section className="mx-auto w-full max-w-[1440px] px-4  min-[500px]:px-8 lg:px-10 xl:px-16">
        <TargetUsersSection />
        <Benefits />
        <Energy />
        <Solutions />
      </section>
    </>
  );
};

export default MidSections;
